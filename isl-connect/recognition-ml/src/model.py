"""
Sequence classifier: landmark sequences -> gloss label.
Fill in once landmark extraction + dataset are ready.
"""
import tensorflow as tf
from tensorflow.keras import layers, models


def build_model(sequence_length: int, num_landmarks: int, num_classes: int) -> tf.keras.Model:
    model = models.Sequential([
        layers.Input(shape=(sequence_length, num_landmarks)),
        layers.LSTM(128, return_sequences=True),
        layers.LSTM(64),
        layers.Dense(64, activation="relu"),
        layers.Dropout(0.3),
        layers.Dense(num_classes, activation="softmax"),
    ])
    model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])
    return model
