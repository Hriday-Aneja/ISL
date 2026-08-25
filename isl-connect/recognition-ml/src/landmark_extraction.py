"""
Step 1: get MediaPipe Holistic running on webcam input and extract
hand/pose/face landmarks per frame. This alone is demoable before any
model is trained.
"""
import cv2
import mediapipe as mp

mp_holistic = mp.solutions.holistic
mp_drawing = mp.solutions.drawing_utils


def run_landmark_preview():
    cap = cv2.VideoCapture(0)
    with mp_holistic.Holistic(min_detection_confidence=0.5,
                               min_tracking_confidence=0.5) as holistic:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break

            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = holistic.process(frame)
            frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

            mp_drawing.draw_landmarks(frame, results.left_hand_landmarks,
                                       mp_holistic.HAND_CONNECTIONS)
            mp_drawing.draw_landmarks(frame, results.right_hand_landmarks,
                                       mp_holistic.HAND_CONNECTIONS)
            mp_drawing.draw_landmarks(frame, results.pose_landmarks,
                                       mp_holistic.POSE_CONNECTIONS)

            cv2.imshow("ISL Recognition - Landmark Preview", frame)
            if cv2.waitKey(10) & 0xFF == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    run_landmark_preview()
