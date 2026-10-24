import type { SignId } from '../types';

// Sign videos that actually ship with the web app (public/avatar-videos).
// This is the single source of truth for "which signs can be played" — the
// avatar stage and the Daily Translator both read it, so a sign never claims
// a clip that isn't there.
export const AVATAR_VIDEOS: Partial<Record<SignId, string>> = {
  DAUGHTER: '/avatar-videos/daughter.mp4',
  DOCTOR: '/avatar-videos/doctor.mp4',
  HAPPY: '/avatar-videos/happy.mp4',
  HELLO: '/avatar-videos/hello.mp4',
  HOUSE: '/avatar-videos/house.mp4',
  LAWYER: '/avatar-videos/lawyer.mp4',
  PARENT: '/avatar-videos/parent.mp4',
  SAD: '/avatar-videos/sad.mp4',
  STUDENT: '/avatar-videos/student.mp4',
  TRAIN_STATION: '/avatar-videos/train-station.mp4',
  WAITER: '/avatar-videos/waiter.mp4',
};
