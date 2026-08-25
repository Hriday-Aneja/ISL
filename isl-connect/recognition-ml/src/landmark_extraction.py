import os
os.environ["GLOG_minloglevel"] = "2"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
import cv2

import mediapipe as mp
import numpy as np
from pathlib import Path


mp_holistic = mp.solutions.holistic


# ---------------------------------------------------------
# Settings
# ---------------------------------------------------------

DATASET_DIR = Path("data/processed")
FEATURE_DIR = Path("data/features")

SEQUENCE_LENGTH = 100
FEATURE_SIZE = 225


# ---------------------------------------------------------
# Extract landmarks from one video
# ---------------------------------------------------------

def extract_landmarks(video_path):

    cap = cv2.VideoCapture(str(video_path))

    if not cap.isOpened():
        print(f"Could not open: {video_path}")
        return None

    all_frames = []

    with mp_holistic.Holistic(
        static_image_mode=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    ) as holistic:

        while True:

            success, frame = cap.read()

            if not success:
                break

            # BGR -> RGB
            frame_rgb = cv2.cvtColor(
                frame,
                cv2.COLOR_BGR2RGB
            )

            results = holistic.process(frame_rgb)

            # -------------------------------------------------
            # Left hand: 21 × 3 = 63
            # -------------------------------------------------

            if results.left_hand_landmarks:

                left_hand = np.array([
                    [lm.x, lm.y, lm.z]
                    for lm in results.left_hand_landmarks.landmark
                ])

            else:

                left_hand = np.zeros((21, 3))


            # -------------------------------------------------
            # Right hand: 21 × 3 = 63
            # -------------------------------------------------

            if results.right_hand_landmarks:

                right_hand = np.array([
                    [lm.x, lm.y, lm.z]
                    for lm in results.right_hand_landmarks.landmark
                ])

            else:

                right_hand = np.zeros((21, 3))


            # -------------------------------------------------
            # Pose: 33 × 3 = 99
            # -------------------------------------------------

            if results.pose_landmarks:

                pose = np.array([
                    [lm.x, lm.y, lm.z]
                    for lm in results.pose_landmarks.landmark
                ])

            else:

                pose = np.zeros((33, 3))


            # -------------------------------------------------
            # Combine
            # 63 + 63 + 99 = 225
            # -------------------------------------------------

            frame_features = np.concatenate([
                left_hand.flatten(),
                right_hand.flatten(),
                pose.flatten()
            ])

            all_frames.append(frame_features)


    cap.release()


    if len(all_frames) == 0:

        print(f"No frames found: {video_path}")
        return None


    return np.array(
        all_frames,
        dtype=np.float32
    )


# ---------------------------------------------------------
# Make every video exactly 100 frames
# ---------------------------------------------------------

def fix_sequence_length(sequence):

    num_frames = sequence.shape[0]

    # Already exactly 100
    if num_frames == SEQUENCE_LENGTH:

        return sequence


    # More than 100 → take 100 evenly spaced frames
    if num_frames > SEQUENCE_LENGTH:

        indices = np.linspace(
            0,
            num_frames - 1,
            SEQUENCE_LENGTH
        ).astype(int)

        return sequence[indices]


    # Less than 100 → zero padding
    padded = np.zeros(
        (SEQUENCE_LENGTH, FEATURE_SIZE),
        dtype=np.float32
    )

    padded[:num_frames] = sequence

    return padded


# ---------------------------------------------------------
# Process all videos
# ---------------------------------------------------------

def process_dataset():

    total = 0
    successful = 0
    failed = 0


    for split in ["train", "val", "test"]:

        split_dir = DATASET_DIR / split

        if not split_dir.exists():

            print(f"Skipping missing split: {split}")
            continue


        for class_dir in sorted(split_dir.iterdir()):

            if not class_dir.is_dir():
                continue


            output_class_dir = (
                FEATURE_DIR
                / split
                / class_dir.name
            )

            output_class_dir.mkdir(
                parents=True,
                exist_ok=True
            )


            video_files = list(
                class_dir.glob("*.MOV")
            ) + list(
                class_dir.glob("*.MP4")
            )


            for video_path in sorted(video_files):

                total += 1

                output_path = (
                    output_class_dir
                    / f"{video_path.stem}.npy"
                )


                # Don't process again if already done
                if output_path.exists():

                    print(
                        f"Already exists: {output_path}"
                    )

                    successful += 1
                    continue


                print(
                    f"\nProcessing: {video_path}"
                )


                sequence = extract_landmarks(
                    video_path
                )


                if sequence is None:

                    failed += 1
                    continue


                sequence = fix_sequence_length(
                    sequence
                )


                np.save(
                    output_path,
                    sequence
                )


                print(
                    f"Saved: {output_path}"
                )

                print(
                    f"Shape: {sequence.shape}"
                )


                successful += 1


    print("\n==============================")
    print("Dataset processing complete")
    print("==============================")
    print(f"Total videos : {total}")
    print(f"Successful   : {successful}")
    print(f"Failed       : {failed}")


# ---------------------------------------------------------
# Main
# ---------------------------------------------------------

if __name__ == "__main__":

    process_dataset()