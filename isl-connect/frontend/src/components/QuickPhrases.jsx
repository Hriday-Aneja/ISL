import React from "react";

const DEFAULT_PHRASES = [
  "Hello",
  "Thank you",
  "Help",
  "Water",
  "Yes",
  "No",
  "Sorry",
];

const animationMap = {
  "Hello": "hello",
  "Thank you": "thankyou",
  "Help": "help",
  "Water": "water",
  "Yes": "yes",
  "No": "no",
  "Sorry": "sorry",
};

export default function QuickPhrases({
  phrases = DEFAULT_PHRASES,
  onSelect,
}) {
  const handleClick = (phrase) => {
    // Existing speech pipeline
    onSelect?.(phrase);

    // Avatar animation
    const animation = animationMap[phrase];

    if (
      animation &&
      window.playAvatarAnimation
    ) {
      window.playAvatarAnimation(animation);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 p-2">
      {phrases.map((phrase) => (
        <button
          key={phrase}
          onClick={() => handleClick(phrase)}
          className="px-3 py-1 bg-indigo-600 text-white rounded-full text-sm hover:bg-indigo-700"
        >
          {phrase}
        </button>
      ))}
    </div>
  );
}