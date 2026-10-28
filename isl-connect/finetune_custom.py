"""Fine-tune the pretrained INCLUDE Transformer (263 classes) on a small
custom dataset instead of training from scratch.

With ~20 signs x 4 signers, training the Transformer from scratch would be
working from very little data and would likely overfit hard, especially for
a 5th person's hands later. The pretrained checkpoint's backbone (l1,
position embedding, the BERT-style layers) already encodes a lot about how
pose/hand keypoint sequences move in general -- reusing it and only
training a fresh classification head (l2) onto your 20 classes should need
far less data to reach a usable accuracy than a from-scratch model would.

This is a NEW, separate script -- it does not modify train_nn.py, runner.py,
dataset.py, or the Transformer definition. It reuses KeypointsDataset and
Transformer unchanged, exactly the way the offline/live inference scripts do.

Usage (run from include-ml, after generate_keypoints_custom.py):
    venv\\Scripts\\python.exe finetune_custom.py ^
        --data_dir custom_data --dataset myisl --epochs 40
"""
import argparse
import json
import sys
import time
from pathlib import Path

import torch
import torch.nn.functional as F
from torch.utils import data
from sklearn.metrics import accuracy_score

ROOT = Path(__file__).resolve().parent
INCLUDE_ROOT = ROOT / "INCLUDE-master"
sys.path.insert(0, str(INCLUDE_ROOT))
from configs import TransformerConfig  # noqa: E402
from models import Transformer  # noqa: E402
from dataset import KeypointsDataset  # noqa: E402
from utils import seed_everything, AverageMeter, EarlyStopping  # noqa: E402

PRETRAINED_N_CLASSES = 263  # shape the pretrained checkpoint's l2 layer was saved with


def parse_args():
    parser = argparse.ArgumentParser(description="Fine-tune the INCLUDE transformer on a custom dataset")
    parser.add_argument("--data_dir", type=Path, required=True,
                         help="folder generate_keypoints_custom.py wrote, containing "
                              "<dataset>_{train,val,test}_keypoints/")
    parser.add_argument("--dataset", type=str, required=True,
                         help="matches --dataset passed to generate_keypoints_custom.py")
    parser.add_argument("--pretrained", type=Path,
                         default=ROOT / "models" / "transformer_small" / "transformer.pth")
    parser.add_argument("--save_path", type=Path, default=ROOT / "models" / "custom")
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch_size", type=int, default=8,
                         help="small default -- custom datasets here are expected to be tiny")
    parser.add_argument("--learning_rate", type=float, default=1e-4)
    parser.add_argument("--freeze_backbone", action="store_true", default=True)
    parser.add_argument("--no_freeze_backbone", dest="freeze_backbone", action="store_false",
                         help="fine-tune the whole model instead of just the new head -- "
                              "only worth trying if freezing underfits AND you have enough data")
    parser.add_argument("--use_augs", action="store_true",
                         help="dataset.py's built-in rotation/cutout/resample augmentations -- "
                              "worth turning on given how little data a custom set usually has")
    parser.add_argument("--seed", type=int, default=0)
    return parser.parse_args()


def build_model(pretrained_path, n_classes, device, freeze_backbone):
    config = TransformerConfig(size="small", max_position_embeddings=256)
    model = Transformer(config=config, n_classes=PRETRAINED_N_CLASSES)
    checkpoint = torch.load(pretrained_path, map_location=device)
    model.load_state_dict(checkpoint["model"])

    # Swap the classifier head for the new class count. l1, the position
    # embedding, and all BERT layers keep their pretrained weights; only l2
    # (the final Linear(hidden_size, n_classes)) is replaced and starts fresh.
    model.l2 = torch.nn.Linear(in_features=config.hidden_size, out_features=n_classes)

    if freeze_backbone:
        for name, param in model.named_parameters():
            if not name.startswith("l2."):
                param.requires_grad = False
        print("Backbone frozen -- only training the new classification head (l2). "
              "Pass --no_freeze_backbone to fine-tune everything instead.")
    else:
        print("Fine-tuning the WHOLE model (backbone + head). With a very small dataset "
              "this risks overfitting more than freezing the backbone does.")

    return model.to(device)


def run_epoch(dataloader, model, device, optimizer=None):
    is_train = optimizer is not None
    model.train() if is_train else model.eval()
    losses, accuracy = AverageMeter(), AverageMeter()
    with torch.set_grad_enabled(is_train):
        for batch in dataloader:
            input_data = batch["data"].to(device)
            label = batch["label"].to(device)
            if is_train:
                optimizer.zero_grad()
            preds = model(input_data)
            loss = F.cross_entropy(preds, label)
            if is_train:
                loss.backward()
                optimizer.step()
            losses.update(loss.item())
            pred_labels = torch.argmax(torch.softmax(preds.detach().cpu(), dim=-1), dim=-1)
            accuracy.update(accuracy_score(label.cpu().numpy(), pred_labels.numpy()))
    return losses.avg, accuracy.avg


def main():
    args = parse_args()
    seed_everything(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    label_map_path = INCLUDE_ROOT / "label_maps" / f"label_map_{args.dataset}.json"
    with label_map_path.open(encoding="utf-8") as f:
        label_map = json.load(f)
    n_classes = len(label_map)
    print(f"{n_classes} classes: {sorted(label_map, key=label_map.get)}")

    train_dataset = KeypointsDataset(
        keypoints_dir=str(args.data_dir / f"{args.dataset}_train_keypoints"),
        use_augs=args.use_augs, label_map=label_map, mode="train", max_frame_len=169,
    )
    val_dir = args.data_dir / f"{args.dataset}_val_keypoints"
    val_dataset = KeypointsDataset(
        keypoints_dir=str(val_dir), use_augs=False, label_map=label_map, mode="val", max_frame_len=169,
    ) if any(val_dir.glob("*.json")) else None
    print(f"train clips: {len(train_dataset)}   val clips: {len(val_dataset) if val_dataset else 0}")
    if not val_dataset:
        print("No val clips at all -- can't track validation accuracy or use early stopping "
              "against it. Training for the full --epochs and saving the final model instead.")

    train_loader = data.DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True,
                                    num_workers=0, pin_memory=(device.type == "cuda"))
    val_loader = data.DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False,
                                  num_workers=0, pin_memory=(device.type == "cuda")) if val_dataset else None

    model = build_model(args.pretrained, n_classes, device, args.freeze_backbone)
    trainable = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(trainable, lr=args.learning_rate, weight_decay=0.01)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.2) \
        if val_loader else None

    args.save_path.mkdir(parents=True, exist_ok=True)
    model_path = args.save_path / f"{args.dataset}_finetuned.pth"
    es = EarlyStopping(patience=15, mode="max") if val_loader else None

    for epoch in range(args.epochs):
        t0 = time.time()
        train_loss, train_acc = run_epoch(train_loader, model, device, optimizer)
        if val_loader:
            val_loss, val_acc = run_epoch(val_loader, model, device, optimizer=None)
            scheduler.step(val_acc)
            print(f"epoch {epoch+1}/{args.epochs}  train loss {train_loss:.4f} acc {train_acc:.3f}  "
                  f"val loss {val_loss:.4f} acc {val_acc:.3f}  ({time.time()-t0:.1f}s)")
            es(model_path=str(model_path), epoch_score=val_acc, model=model, optimizer=optimizer, scheduler=scheduler)
            if es.early_stop:
                print("Early stopping (val accuracy stopped improving)")
                break
        else:
            print(f"epoch {epoch+1}/{args.epochs}  train loss {train_loss:.4f} acc {train_acc:.3f}  "
                  f"({time.time()-t0:.1f}s)")

    if not val_loader:
        torch.save({"model": model.state_dict(), "optimizer": optimizer.state_dict(), "scheduler": None},
                   model_path)
    print(f"\nSaved: {model_path}")
    print(f"This checkpoint has a {n_classes}-class head, NOT the original 263 -- point "
          f"live_inference.py's --model and --labels at this file and {label_map_path} to use it.")


if __name__ == "__main__":
    main()