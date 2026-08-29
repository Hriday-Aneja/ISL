# Personal ISL Data Collection & Fine-Tuning

This guide explains how team members should set up the project, view
reference signs, record personal ISL data, and submit it for the
fine-tuning experiment.

## Team Signers

Currently:

- Hriday
- Anshu
- Arnav
- Aayush

Each person records data separately using their own signer name.

---

## 1. Clone / Update the Repository

If you don't have the project:

    git clone <REPOSITORY_URL>

    cd isl-connect\recognition-ml

If you already have it:

    git pull

---

## 2. Python Environment

This project uses Python 3.12.

Create the environment if needed:

    py -3.12 -m venv venv312

Activate it:

    .\venv312\Scripts\Activate.ps1

You should see:

    (venv312)

Install dependencies:

    pip install -r requirements.txt

Verify:

    python --version

---

## 3. ISL Sign Reference Videos

Before recording, use the `sign_references` folder.

Expected structure:

    sign_references/
    ├── sign_reference.html
    └── videos/
        ├── Beautiful.MOV
        ├── Bird.MOV
        ├── Daughter.MOV
        ├── ...
        └── you.MOV

Open:

    sign_references/sign_reference.html

The page contains one reference video for each of the 24 signs.

If the `sign_references` folder is provided as a ZIP:

1. Extract the ZIP.
2. Keep the complete `sign_references` folder together.
3. Open `sign_reference.html`.
4. Do not move the `videos` folder away from the HTML file.

The ZIP itself can be deleted after extraction.

---

## 4. Classes to Record

Record all 24 classes:

1. Beautiful
2. Bird
3. Daughter
4. Doctor
5. Dog
6. Father
7. Hello
8. House
9. I
10. Lawyer
11. Mother
12. Parent
13. Restaurant
14. Son
15. Student
16. Teacher
17. Thank you
18. Train Station
19. Waiter
20. happy
21. he
22. sad
23. she
24. you

Do not rename the class names.

---

## 5. Recording Target

Recommended:

    8–10 clips per sign

For one person:

    24 × 10 = 240 clips

For four people:

    4 × 240 = 960 clips

If necessary, start with 5 clips per sign and increase later.

---

## 6. Recording Your Personal Data

Use your own name as the signer.

### Hriday

    python src/record_personal_data.py --signer Hriday

### Anshu

    python src/record_personal_data.py --signer Anshu

### Arnav

    python src/record_personal_data.py --signer Arnav

### Aayush

    python src/record_personal_data.py --signer Aayush

Controls:

    n = next sign
    p = previous sign
    r = start/stop recording
    q = quit

Press `r` to start recording.

Perform the sign.

Press `r` again to save the clip.

Then press `n` to move to the next sign.

---

## 7. Recording Guidelines

For every clip:

- Perform only the selected sign.
- Watch the reference video before recording.
- Keep both hands and upper body clearly visible where possible.
- Keep the camera stable.
- Use reasonable lighting.
- Stay within the camera frame.
- Do not deliberately make every clip identical.
- Natural variation in position, speed and movement is useful.
- Avoid unnecessary movement or people in the background.

---

## 8. Where Personal Recordings Are Stored

The recorder automatically creates:

    data/personal_raw/
    ├── Hriday/
    │   ├── Beautiful/
    │   ├── Bird/
    │   └── ...
    ├── Anshu/
    ├── Arnav/
    └── Aayush/

Each signer must only record inside their own signer folder.

---

## 9. Do NOT Push Personal Recordings to GitHub

Do NOT commit:

    data/raw_selected/
    data/features_selected/
    data/personal_raw/
    data/personal_features/
    include_selected/

These contain dataset videos/features and should remain outside GitHub.

Only project code and documentation should be pushed.

---

## 10. Submit Your Recorded Data

After finishing recording:

1. Close the recorder.
2. Go to:

       data/personal_raw/

3. Find your signer folder.
4. ZIP only your own folder.

For example:

    Anshu.zip
    Arnav.zip
    Aayush.zip

Send the ZIP to Hriday.

The final combined structure on the main machine will be:

    data/personal_raw/
    ├── Hriday/
    ├── Anshu/
    ├── Arnav/
    └── Aayush/

Do not upload the personal videos to GitHub.

---

## 11. Feature Extraction

After all signers' recordings have been collected, the project owner
will extract features.

Run:

    python src/extract_personal_features.py

This reads:

    data/personal_raw/

and creates:

    data/personal_features/

The extraction uses the same landmark extraction pipeline as the base
dataset.

Each feature sequence should have:

    (100, 225)

The personal data extraction does not modify:

    data/raw_selected/
    data/features_selected/

---

## 12. Fine-Tuning

After feature extraction and verification, the existing base model can
be fine-tuned using the personal data.

Example:

    python src/finetune.py --holdout-signer Aayush

This means Aayush's personal data is kept out of the fine-tuning
training data and used as a held-out signer for evaluating
generalization.

Other holdout experiments can be performed:

    Hriday
    Anshu
    Arnav
    Aayush

The fine-tuned model is saved separately from the original base model.

---

## 13. Important Experiment Rule

The purpose of signer holdout is to test whether the model can
generalize to a person whose personal samples were not used during
fine-tuning.

Example:

    Fine-tuning:
        Hriday + Anshu + Arnav

    Holdout:
        Aayush

Do not accidentally include the held-out signer's personal data in
training.

---

## 14. Complete Workflow

    Reference videos
          ↓
    Watch sign_reference.html
          ↓
    Record personal clips
          ↓
    data/personal_raw/<signer>/
          ↓
    Collect all 4 signers
          ↓
    extract_personal_features.py
          ↓
    data/personal_features/
          ↓
    Verify features
          ↓
    finetune.py
          ↓
    Signer-holdout evaluation
          ↓
    Fine-tuned model

---

## Quick Start

    git pull

    .\venv312\Scripts\Activate.ps1

    pip install -r requirements.txt

Open:

    sign_references/sign_reference.html

Then record using your name:

    python src/record_personal_data.py --signer YOUR_NAME

Record approximately 8–10 clips for each of the 24 signs.

When finished, ZIP:

    data/personal_raw/YOUR_NAME/

and send it to Hriday.

Do NOT push personal recordings to GitHub.
