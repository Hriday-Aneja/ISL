import unittest

import torch

# Bootstraps INCLUDE-master imports before importing configs/models.
import custom_common  # noqa: F401
from configs import TransformerConfig
from custom_model import DeterministicEvalTransformer, build_model, crop_collate, masked_max_pool
from models import Transformer


class PaddingMaskTests(unittest.TestCase):
    def test_collate_handles_mixed_lengths_and_polarity(self):
        items = [
            {"data": torch.zeros(5, 134), "length": 2, "label": 0, "uid": "a"},
            {"data": torch.zeros(5, 134), "length": 5, "label": 1, "uid": "b"},
        ]
        batch = crop_collate(5)(items)
        expected = torch.tensor([[True, True, False, False, False], [True, True, True, True, True]])
        self.assertEqual(tuple(batch["attention_mask"].shape), (2, 5))
        self.assertTrue(torch.equal(batch["attention_mask"], expected))

    def test_masked_max_pool_ignores_padded_queries(self):
        values = torch.tensor([[[1.0, 2.0], [3.0, 4.0], [100.0, 200.0]],
                               [[5.0, 6.0], [7.0, 8.0], [9.0, 10.0]]])
        mask = torch.tensor([[True, True, False], [True, True, True]])
        pooled = masked_max_pool(values, mask)
        self.assertTrue(torch.equal(pooled, torch.tensor([[3.0, 4.0], [9.0, 10.0]])))

    def test_padded_frames_do_not_change_valid_outputs(self):
        torch.manual_seed(7)
        model = build_model("small", 24, torch.device("cpu"))
        model.eval()
        valid = torch.randn(1, 3, 134)
        first = torch.cat([valid, torch.zeros(1, 2, 134)], dim=1)
        second = torch.cat([valid, torch.randn(1, 2, 134) * 1000], dim=1)
        mask = torch.tensor([[True, True, True, False, False]])
        with torch.no_grad():
            first_logits = model(first, attention_mask=mask)
            second_logits = model(second, attention_mask=mask)
        self.assertTrue(torch.allclose(first_logits, second_logits, atol=1e-5, rtol=1e-5))
        self.assertFalse(torch.isnan(first_logits).any())

    def test_state_dict_shapes_remain_compatible(self):
        config = TransformerConfig(size="small", max_position_embeddings=256)
        original = Transformer(config=config, n_classes=24)
        masked = DeterministicEvalTransformer(config=config, n_classes=24)
        self.assertEqual(set(original.state_dict()), set(masked.state_dict()))
        for name, tensor in original.state_dict().items():
            self.assertEqual(tensor.shape, masked.state_dict()[name].shape, name)


if __name__ == "__main__":
    unittest.main()