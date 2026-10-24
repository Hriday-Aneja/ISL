import { Sparkles } from 'lucide-react';
import type { ScenarioId } from '../../data/dailyScenarios';
import {
  cardKey,
  isFavouriteCard,
  type DailyState,
  type MessageSource,
} from '../../lib/dailyStore';
import { PhraseCard } from './PhraseCard';
import { SuggestionsPanel } from './SuggestionsPanel';

interface AIAssistanceTabProps {
  scenario: ScenarioId;
  scenarioLabel: string;
  state: DailyState;
  aiAvailable: boolean | null;
  recentTexts: string[];
  recentTagged: Array<{ from: 'me' | 'other'; text: string }>;
  hindiFor: (text: string) => string | undefined;
  showHindiOnly: boolean;
  autoTrigger: { id: string; replyTo?: string } | null;
  autoEnabled: boolean;
  description: string;
  descriptionToken: number;
  onFreshCards: (count: number) => void;
  onSend: (text: string, source: MessageSource) => void;
  onToggleFavourite: (text: string) => void;
  onCustomise: (text: string) => void;
}

export function AIAssistanceTab({
  scenario,
  scenarioLabel,
  state,
  aiAvailable,
  recentTexts,
  recentTagged,
  hindiFor,
  showHindiOnly,
  autoTrigger,
  autoEnabled,
  description,
  descriptionToken,
  onFreshCards,
  onSend,
  onToggleFavourite,
  onCustomise,
}: AIAssistanceTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-md border-2 border-signal/30 bg-signal/10 p-4">
        <Sparkles className="mt-0.5 shrink-0 text-signal" size={20} />
        <div>
          <h3 className="font-display text-lg font-semibold text-cream">AI Assistance</h3>
          <p className="mt-1 text-sm text-mist">
            Get cards based on your situation and recent conversation. New cards will appear here automatically.
          </p>
        </div>
      </div>
      <SuggestionsPanel
        key={scenario}
        scenarioId={scenario}
        scenarioLabel={scenarioLabel}
        description={description}
        existingTexts={[]}
        recentTexts={recentTexts}
        recentTagged={recentTagged}
        aiAvailable={aiAvailable}
        autoFetchToken={descriptionToken}
        needsDescription={scenario === 'custom' && !description}
        autoTrigger={autoTrigger}
        autoEnabled={autoEnabled}
        onFreshCards={onFreshCards}
        renderCard={(text, fresh) => (
          <PhraseCard
            key={`${fresh ? 'new-' : ''}${cardKey(text)}`}
            text={text}
            hindi={hindiFor(text)}
            showHindiOnly={showHindiOnly}
            eyebrow={fresh ? 'New for this conversation' : 'AI suggestion'}
            tone="suggestion"
            favourite={isFavouriteCard(state, text)}
            onSelect={() => onSend(text, 'suggestion')}
            onToggleFavourite={() => onToggleFavourite(text)}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'copy';
              event.dataTransfer.setData(
                'application/x-samvaad-card',
                JSON.stringify({ text, source: 'suggestion' })
              );
              event.dataTransfer.setData('text/plain', text);
            }}
            extra={{
              label: 'Save a copy to edit',
              icon: <span aria-hidden>+</span>,
              onClick: () => onCustomise(text),
            }}
          />
        )}
      />
    </div>
  );
}
