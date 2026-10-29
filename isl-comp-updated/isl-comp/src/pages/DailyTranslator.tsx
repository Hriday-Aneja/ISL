import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Hand, Settings, WifiOff } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ScenarioPicker } from '../components/daily/ScenarioPicker';
import { EmergencyBar } from '../components/daily/EmergencyBar';
import { CardsTab } from '../components/daily/CardsTab';
import { AIAssistanceTab } from '../components/daily/AIAssistanceTab';
import { SignsTab } from '../components/daily/SignsTab';
import { SavedTab } from '../components/daily/SavedTab';
import { SignDialog } from '../components/daily/SignDialog';
import { CardEditor } from '../components/daily/CardEditor';
import { ConversationPanel } from '../components/daily/ConversationPanel';
import { FocusMode } from '../components/daily/FocusMode';
import { SettingsDialog } from '../components/daily/SettingsDialog';
import { SCENARIO_ICONS } from '../components/daily/scenarioIcons';
import { getScenario, SCENARIOS, type ScenarioId } from '../data/dailyScenarios';
import type { IslSign } from '../data/islSigns';
import {
  findDuplicateCustom,
  type CardScope,
  type CustomCard,
  type DailyMessage,
  type MessageSender,
  type MessageSource,
} from '../lib/dailyStore';
import { useDailyStore } from '../hooks/useDailyStore';
import { useTextToSpeech, type SpeechPart } from '../hooks/useTextToSpeech';
import { useHindi } from '../hooks/useHindi';
import { lookupHindi } from '../services/hindi';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { fetchAiStatus } from '../services/dailySuggestions';

type Tab = 'cards' | 'signs' | 'saved' | 'ai';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'cards', label: 'Cards' },
  { id: 'signs', label: 'ISL Signs' },
  { id: 'saved', label: 'Saved' },
  { id: 'ai', label: 'AI Assistance' },
];

type EditorState =
  | { mode: 'create'; text: string }
  | { mode: 'edit'; card: CustomCard }
  | null;

/** Daily Translator: pick a situation, tap cards or signs, talk, and keep it all in one conversation. */
export function DailyTranslator() {
  const store = useDailyStore();
  const { state } = store;
  const tts = useTextToSpeech();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const [tab, setTab] = useState<Tab>('cards');
  const [situationName, setSituationName] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionToken, setDescriptionToken] = useState(0);
  const [editor, setEditor] = useState<EditorState>(null);
  const [dialogSign, setDialogSign] = useState<IslSign | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [toast, setToast] = useState('');
  // Set after every message so the Cards tab can fetch cards that fit the conversation.
  const [autoTrigger, setAutoTrigger] = useState<{ id: string; replyTo?: string } | null>(null);
  const [newAiCards, setNewAiCards] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const { scenarioId } = useParams<{ scenarioId?: string }>();
  const routeScenario = SCENARIOS.some((item) => item.id === scenarioId)
    ? (scenarioId as ScenarioId)
    : null;
  const previousScenario = useRef<ScenarioId | null | undefined>(undefined);

  const { settings } = state;

  useEffect(() => {
    document.title = 'Daily Translator — SAMVAAD';
  }, []);

  useEffect(() => {
    if (previousScenario.current !== undefined && previousScenario.current !== routeScenario) {
      store.clearMessages();
      setAutoTrigger(null);
      setNewAiCards(0);
    }
    previousScenario.current = routeScenario;
  }, [routeScenario, store.clearMessages]);

  // Is AI configured on the server? (Never exposes the key, only a yes/no.)
  useEffect(() => {
    const controller = new AbortController();
    void fetchAiStatus({ signal: controller.signal }).then((ok) => {
      if (!controller.signal.aborted) setAiAvailable(ok);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const notify = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);

  // ---- sending ----------------------------------------------------------

  /** What to read aloud for a message, following the English / Hindi switches. */
  const speechParts = useCallback(
    (text: string, textHi?: string): SpeechPart[] => {
      const hi = textHi ?? lookupHindi(text);
      const parts: SpeechPart[] = [];
      if (settings.speakEnglish) parts.push({ text });
      if (settings.speakHindi && hi) parts.push({ text: hi, lang: 'hi-IN' });
      // Never stay silent because Hindi is missing or English is switched off.
      return parts.length > 0 ? parts : [{ text }];
    },
    [settings.speakEnglish, settings.speakHindi]
  );

  const speakMessage = useCallback(
    (message: DailyMessage) => {
      if (tts.state.status === 'speaking' && tts.state.activeId === message.id) tts.cancel();
      else tts.speakSequence(speechParts(message.text, message.textHi), { id: message.id });
    },
    [tts, speechParts]
  );

  const addToConversation = useCallback(
    (text: string, sender: MessageSender, source: MessageSource, signId?: string) => {
      // Your own cards and signs get a Hindi line (built-in or already translated).
      const textHi =
        sender === 'me' && source !== 'sign' && (settings.showHindi || settings.speakHindi)
          ? lookupHindi(text)
          : undefined;
      const message = store.addMessage({ sender, source, text, signId, textHi });
      if (!message) return null;
      // Cards and signs are things YOU show; speak them aloud if enabled. Other
      // people's words are already audible, so they are not read back.
      if (sender === 'me' && settings.autoSpeak && tts.supported && source !== 'typed') {
        tts.speakSequence(speechParts(message.text, message.textHi), { id: message.id });
      }
      // Every message (yours or theirs) is a cue for new, context-aware cards.
      setAutoTrigger({ id: message.id, replyTo: sender === 'other' ? message.text : undefined });
      return message;
    },
    [store, settings.autoSpeak, settings.showHindi, settings.speakHindi, tts, speechParts]
  );

  const sendCard = useCallback(
    (text: string, source: MessageSource) => {
      addToConversation(text, 'me', source);
      store.addRecent(text);
      if (!isDesktop) notify('Added to conversation');
    },
    [addToConversation, store, isDesktop, notify]
  );

  const sendSign = useCallback(
    (sign: IslSign) => {
      addToConversation(sign.label, 'me', 'sign', sign.id);
      if (!isDesktop) notify('Added to conversation');
    },
    [addToConversation, isDesktop, notify]
  );

  const composerSend = useCallback(
    (text: string, sender: MessageSender, source: MessageSource) => {
      addToConversation(text, sender, source);
    },
    [addToConversation]
  );

  const sendEmergency = useCallback(
    (text: string) => {
      addToConversation(text, 'me', 'emergency');
      store.addRecent(text);
      if (!isDesktop) notify('Added to conversation');
    },
    [addToConversation, store, isDesktop, notify]
  );

  // ---- derived ------------------------------------------------------------

  const recentTexts = useMemo(
    () => (settings.useConversationContext ? state.messages.slice(-6).map((m) => m.text) : []),
    [settings.useConversationContext, state.messages]
  );

  const recentTagged = useMemo(
    () =>
      settings.useConversationContext
        ? state.messages.slice(-6).map((m) => ({ from: m.sender === 'other' ? ('other' as const) : ('me' as const), text: m.text }))
        : [],
    [settings.useConversationContext, state.messages]
  );

  // Hindi for cards the app has no built-in translation for (your own, favourites).
  const hindiWanted = settings.showHindi || settings.speakHindi;
  const hindiTexts = useMemo(
    () => [
      ...state.customCards.map((c) => c.text),
      ...state.favouriteCards.map((f) => f.text),
      ...state.recents.map((r) => r.text),
    ],
    [state.customCards, state.favouriteCards, state.recents]
  );
  const hindiLookup = useHindi(hindiTexts, hindiWanted, aiAvailable === true && online);
  const hindiFor = useCallback(
    (text: string) => (settings.showHindi ? hindiLookup(text) : undefined),
    [hindiLookup, settings.showHindi]
  );

  // A fresh batch of cards arrived: tell the user, since the list can be below the fold.
  const onFreshCards = useCallback(
    (count: number) => {
      setNewAiCards((current) => current + count);
      notify(`${count} new AI card${count === 1 ? '' : 's'} added — open AI Assistance`);
    },
    [notify]
  );

  const autoEnabled = settings.autoSuggest && settings.useConversationContext && aiAvailable === true && online;

  const speakingId = tts.state.status === 'speaking' ? tts.state.activeId ?? null : null;

  const duplicateCheck = (ignoreId?: string) => (text: string, scope: CardScope) =>
    Boolean(findDuplicateCustom(state, text, scope, ignoreId));

  const scenario = routeScenario;
  const info = scenario ? getScenario(scenario) : null;
  const Icon = scenario ? SCENARIO_ICONS[scenario] : null;

  if (scenarioId && !routeScenario) return <Navigate to="/daily" replace />;

  const pickScenario = (id: ScenarioId) => {
    navigate(`/daily/${id}`);
    setTab('cards');
    if (id !== 'custom') {
      setDescription('');
      setDescriptionToken(0);
    }
  };

  const openSign = (sign: IslSign) => setDialogSign(sign);

  return (
    <div className="min-h-screen overflow-hidden bg-night font-dm text-cream">
      <div className={`daily-root mx-auto max-w-[1312px] px-6 py-6 pb-8 sm:py-8 lg:px-16 ${settings.highContrast ? 'daily-contrast' : ''}`}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-mist">Samvaad</p>
            <h1 className="font-display text-2xl font-semibold text-cream sm:text-3xl">Daily Translator</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="btn-secondary min-h-[48px] px-4 text-base"
            >
              <Settings size={18} /> Settings
            </button>
          </div>
        </div>

        {!online && (
          <p role="status" className="mb-4 flex items-start gap-2 rounded-md border-2 border-voice bg-voice-soft px-4 py-3 text-base text-cream">
            <WifiOff size={19} className="mt-0.5 shrink-0 text-voice-deep" />
            You are offline. Cards, signs and typing still work. AI suggestions and speech recognition need a connection.
          </p>
        )}
        {!store.persistent && (
          <p role="status" className="mb-4 rounded-md border-2 border-voice bg-voice-soft px-4 py-3 text-base text-cream">
            This browser is not letting the page save data, so your cards and conversation will be lost when you close it.
          </p>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(460px,540px)]">
          <div className="min-w-0 space-y-5">
            {!scenario && (
              <EmergencyBar
                collapsed={settings.emergencyCollapsed}
                onToggle={() => store.setSetting('emergencyCollapsed', !settings.emergencyCollapsed)}
                onSend={sendEmergency}
                hindiFor={hindiFor}
              />
            )}

            {!scenario || !info || !Icon ? (
              <ScenarioPicker onPick={pickScenario} />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/daily')}
                    className="btn-secondary min-h-[48px] px-4 text-base"
                  >
                    <ArrowLeft size={18} /> Change situation
                  </button>
                  <p className="flex items-center gap-2 text-lg font-semibold text-cream">
                    <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-signal-soft text-signal-deep">
                      <Icon size={19} />
                    </span>
                    {info.label}
                  </p>
                </div>

                <div role="tablist" aria-label="Daily Translator sections" className="flex gap-1 rounded-md border-2 border-white/15 bg-night-card p-1">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      id={`daily-tab-${t.id}`}
                      aria-selected={tab === t.id}
                      aria-controls={`daily-panel-${t.id}`}
                      tabIndex={tab === t.id ? 0 : -1}
                      onClick={() => {
                        setTab(t.id);
                        if (t.id === 'ai') setNewAiCards(0);
                      }}
                      onKeyDown={(event) => {
                        const i = TABS.findIndex((x) => x.id === tab);
                        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                          event.preventDefault();
                          const next = TABS[(i + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
                          setTab(next.id);
                          document.getElementById(`daily-tab-${next.id}`)?.focus();
                        }
                      }}
                      className={`min-h-[48px] flex-1 rounded-sm px-3 text-base font-bold transition-colors ${
                        tab === t.id ? 'bg-signal text-[#0c1413]' : 'text-mist hover:bg-white/[0.06] hover:text-cream'
                      }`}
                    >
                      {t.id === 'signs' && <Hand size={16} className="mr-1.5 inline -translate-y-px" aria-hidden />}
                      {t.id === 'ai' && <span className="mr-1.5" aria-hidden>✦</span>}
                      {t.label}
                      {t.id === 'ai' && newAiCards > 0 && (
                        <span className="ml-1.5 rounded-full bg-voice px-2 py-0.5 text-xs text-[#0e1116]">
                          {newAiCards}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div role="tabpanel" id={`daily-panel-${tab}`} aria-labelledby={`daily-tab-${tab}`} tabIndex={-1}>
                  {tab === 'cards' && (
                    <CardsTab
                      scenario={scenario}
                      state={state}
                      aiAvailable={aiAvailable}
                      recentTexts={recentTexts}
                      recentTagged={recentTagged}
                      hindiFor={hindiFor}
                      showHindiOnly={settings.showHindiOnly}
                      autoTrigger={autoTrigger}
                      autoEnabled={autoEnabled}
                      onFreshCards={onFreshCards}
                      situationName={situationName}
                      description={description}
                      descriptionToken={descriptionToken}
                      onSubmitDescription={(name, text) => {
                        setSituationName(name);
                        setDescription(text);
                        setDescriptionToken((n) => n + 1);
                      }}
                      onSend={sendCard}
                      onToggleFavourite={store.toggleFavouriteCard}
                      onNewCard={(text = '') => setEditor({ mode: 'create', text })}
                      onEditCard={(card) => setEditor({ mode: 'edit', card })}
                      onCustomise={(text) => setEditor({ mode: 'create', text })}
                    />
                  )}
                  {tab === 'signs' && (
                    <SignsTab
                      favouriteSigns={state.favouriteSigns}
                      onOpen={openSign}
                      onUse={sendSign}
                      onToggleFavourite={(sign) => store.toggleFavouriteSign(sign.id)}
                    />
                  )}
                  {tab === 'saved' && (
                    <SavedTab
                      state={state}
                      onSend={sendCard}
                      onToggleFavourite={store.toggleFavouriteCard}
                      onOpenSign={openSign}
                      onUseSign={sendSign}
                      onToggleFavouriteSign={(sign) => store.toggleFavouriteSign(sign.id)}
                      hindiFor={hindiFor}
                    />
                  )}
                  <div className={tab === 'ai' ? undefined : 'hidden'}>
                    <AIAssistanceTab
                      scenario={scenario}
                      scenarioLabel={scenario === 'custom' && situationName ? situationName : info.label}
                      state={state}
                      aiAvailable={aiAvailable}
                      recentTexts={recentTexts}
                      recentTagged={recentTagged}
                      hindiFor={hindiFor}
                      showHindiOnly={settings.showHindiOnly}
                      autoTrigger={autoTrigger}
                      autoEnabled={autoEnabled}
                      description={description}
                      descriptionToken={descriptionToken}
                      onFreshCards={onFreshCards}
                      onSend={sendCard}
                      onToggleFavourite={store.toggleFavouriteCard}
                      onCustomise={(text) => setEditor({ mode: 'create', text })}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <aside
            aria-label="Conversation"
            className="daily-surface min-h-[620px] overflow-hidden rounded-lg border-2 border-white/15 bg-night-card shadow-stage lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]"
          >
            <ConversationPanel
              messages={state.messages}
              largeText={settings.largeText}
              speakingId={speakingId}
              ttsSupported={tts.supported}
              onSpeak={speakMessage}
              onFocus={setFocusId}
              onOpenSign={openSign}
              onSend={composerSend}
              onClear={store.clearMessages}
              onToggleLargeText={() => store.setSetting('largeText', !settings.largeText)}
              onDropCard={sendCard}
              listenHindi={settings.listenHindi}
              showHindiOnly={settings.showHindiOnly}
            />
          </aside>
        </div>
      </div>

      {toast && (
        <div
          role="status"
          className={`fixed left-1/2 z-[60] -translate-x-1/2 whitespace-nowrap rounded-full bg-cream px-5 py-3 text-base font-semibold text-night shadow-stage ${
            'bottom-4'
          }`}
        >
          {toast}
        </div>
      )}

      {editor && (
        <CardEditor
          mode={editor.mode}
          initialText={editor.mode === 'edit' ? editor.card.text : editor.text}
          initialScope={editor.mode === 'edit' ? editor.card.scenarioId : scenario && scenario !== 'custom' ? scenario : 'all'}
          isDuplicate={duplicateCheck(editor.mode === 'edit' ? editor.card.id : undefined)}
          onClose={() => setEditor(null)}
          onSave={(text, scope) => {
            if (editor.mode === 'edit') {
              store.updateCustomCard(editor.card.id, text, scope);
              notify('Card updated');
            } else {
              store.addCustomCard(text, scope);
              notify('Card saved');
            }
            setEditor(null);
          }}
          onDelete={
            editor.mode === 'edit'
              ? () => {
                  store.deleteCustomCard(editor.card.id);
                  setEditor(null);
                  notify('Card deleted');
                }
              : undefined
          }
        />
      )}

      {dialogSign && (
        <SignDialog
          sign={dialogSign}
          favourite={state.favouriteSigns.includes(dialogSign.id)}
          onToggleFavourite={() => store.toggleFavouriteSign(dialogSign.id)}
          onUse={() => {
            sendSign(dialogSign);
            setDialogSign(null);
            notify('Added to conversation');
          }}
          onClose={() => setDialogSign(null)}
        />
      )}

      {focusId && (
        <FocusMode
          messages={state.messages}
          startId={focusId}
          speakingId={speakingId}
          ttsSupported={tts.supported}
          onSpeak={speakMessage}
          onClose={() => setFocusId(null)}
        />
      )}

      {showSettings && (
        <SettingsDialog
          settings={settings}
          persistent={store.persistent}
          aiAvailable={aiAvailable}
          onChange={store.setSetting}
          onClose={() => setShowSettings(false)}
        />
      )}

    </div>
  );
}
