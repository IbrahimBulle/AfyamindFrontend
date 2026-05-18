import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, Loader2, Send, Sparkles, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { api, type HealthResponse } from "@/lib/api";
import { focusLabel, getCarePlan, recommendationHeadline } from "@/lib/wellness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
}

const multilingualPrompts: Record<string, string[]> = {
  en: [
    "I feel overwhelmed today",
    "Guide me through a short breathing exercise",
    "Help me understand my screening support path",
    "I need calm sleep ideas",
  ],
  sw: [
    "Ninahisi nimelemewa leo",
    "Niongoze kwenye zoezi fupi la kupumua",
    "Nisaidie kuelewa mpango wangu wa msaada",
    "Nipe njia za kulala vizuri",
  ],
  fr: [
    "Je me sens depasse aujourd'hui",
    "Guide-moi dans un exercice de respiration",
    "Aide-moi a comprendre mon plan de soutien",
    "Donne-moi des idees pour mieux dormir",
  ],
  es: [
    "Me siento abrumado hoy",
    "Guiame en un ejercicio corto de respiracion",
    "Ayudame a entender mi plan de apoyo",
    "Necesito ideas para dormir mejor",
  ],
  ar: [
    "I feel overwhelmed today",
    "Guide me through a short breathing exercise",
    "Help me understand my support plan",
    "I need calm sleep ideas",
  ],
};

export default function AIChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const carePlan = getCarePlan(user?.id);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: "assistant",
      content: buildWelcomeMessage(user?.name, user?.language || "en", carePlan ? recommendationHeadline(carePlan) : ""),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestedActions, setSuggestedActions] = useState<string[]>(carePlan?.suggestedActions || []);
  const [modelName, setModelName] = useState("Wellness assistant");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let isActive = true;

    api.getHealth()
      .then((response) => {
        if (!isActive) return;
        setHealth(response);
        setModelName(buildConfiguredModelLabel(response));
      })
      .catch(() => {
        if (!isActive) return;
        setHealth(null);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;

    const userMsg: ChatMessage = { id: Date.now(), role: "user", content: prompt };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const context = [
        carePlan
          ? `Current support status: ${carePlan.riskLevel} risk, PHQ-9 score ${carePlan.phq9Score}, focuses ${carePlan.primaryFocuses.join(", ")}, ${carePlan.recommendationMessage}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const result = await api.askAI({
        prompt,
        context,
        language: user?.language || "en",
        messages: [...messages, userMsg].map(({ role, content }) => ({ role, content })),
      });

      setModelName(result.model);
      setSuggestedActions(result.suggested_actions);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: result.reply,
        },
      ]);
    } catch (err: unknown) {
      toast({
        title: "AI Error",
        description: err instanceof Error ? err.message : "Unable to load a reply right now.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const quickPrompts = multilingualPrompts[user?.language || "en"] || multilingualPrompts.en;

  return (
    <div className="animate-fade-in flex flex-col gap-4 h-[calc(100vh-7rem)]">
      <header className="glass-surface rounded-[30px] bg-[linear-gradient(135deg,rgba(255,255,255,0.82),rgba(216,244,225,0.56))] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/70 bg-white/70 shadow-[0_10px_24px_rgba(61,121,89,0.12)]">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl tracking-tight">Wellness Companion</h1>
              <p className="text-sm text-muted-foreground">
                {buildAIStatusLine(health)}
              </p>
            </div>
          </div>

          <div className="glass-surface rounded-2xl px-4 py-3 text-sm">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">AI runtime</div>
            <div className="mt-2 font-medium">{buildConfiguredModelLabel(health)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {buildAIStatusBadge(health)}
            </div>
          </div>
        </div>

        {carePlan && (
          <div className="mt-5 rounded-2xl border border-white/60 bg-white/60 px-4 py-3 text-sm text-muted-foreground backdrop-blur-xl">
            Current support path: {recommendationHeadline(carePlan)}
            {carePlan.primaryFocuses.length > 0 && (
              <div className="mt-2">Current focuses: {carePlan.primaryFocuses.map(focusLabel).join(", ")}</div>
            )}
          </div>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4 pr-2">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className="max-w-[78%] flex flex-col gap-2">
              <div
                className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "rounded-br-md border border-white/40 bg-primary text-primary-foreground shadow-[0_14px_28px_rgba(61,121,89,0.16)]"
                    : "glass-surface rounded-bl-md bg-[linear-gradient(140deg,rgba(255,255,255,0.8),rgba(223,245,230,0.52))]"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
              </div>
            </div>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-1">
                <User className="h-4 w-4 text-foreground" />
              </div>
            )}
          </div>
        ))}

        {loading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="glass-surface rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr,0.85fr]">
        <div className="glass-surface rounded-[28px] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Quick prompts</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {quickPrompts.map((qp) => (
              <button
                key={qp}
                onClick={() => {
                  setInput(qp);
                  inputRef.current?.focus();
                }}
                className="rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-xs text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-all hover:border-primary/35 hover:bg-white/80 hover:text-foreground"
              >
                {qp}
              </button>
            ))}
          </div>
        </div>

        <div className="glass-surface rounded-[28px] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Suggested actions</p>
          <p className="mt-2 text-xs text-muted-foreground">Current model: {modelName}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestedActions.map((action) => (
              <span key={action} className="rounded-full border border-white/60 bg-white/70 px-3 py-2 text-xs text-foreground shadow-[0_8px_18px_rgba(61,121,89,0.1)]">
                {action}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-surface flex gap-3 rounded-[28px] border-white/55 px-4 py-4">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Share what is on your mind..."
          className="rounded-2xl h-12 flex-1"
          disabled={loading}
        />
        <Button onClick={handleSend} disabled={loading || !input.trim()} className="rounded-2xl h-12 px-5">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function buildConfiguredModelLabel(health: HealthResponse | null) {
  if (!health) return "Wellness assistant";
  if (health.ai_provider === "ollama") {
    return `Ollama (${health.ai_model})`;
  }
  return `${humanizeProvider(health.ai_provider)} (${health.ai_model})`;
}

function buildAIStatusLine(health: HealthResponse | null) {
  if (!health) {
    return "Context-aware guidance connected to your care plan.";
  }
  if (health.ai_provider === "ollama" && health.ai_is_local) {
    return `Configured to use local Ollama on this machine with ${health.ai_model}.`;
  }
  if (health.ai_provider === "ollama") {
    return `Configured to use Ollama with ${health.ai_model} for context-aware guidance.`;
  }
  return `Configured to use ${humanizeProvider(health.ai_provider)} for context-aware guidance from your care plan.`;
}

function buildAIStatusBadge(health: HealthResponse | null) {
  if (!health) {
    return "Backend health not available yet.";
  }
  if (health.ai_provider === "ollama" && health.ai_is_local) {
    return "Local AI is pointed at the Ollama service on this machine.";
  }
  if (health.ai_provider === "ollama") {
    return "Ollama is configured as the primary provider.";
  }
  return `Primary provider: ${humanizeProvider(health.ai_provider)}.`;
}

function humanizeProvider(provider: string) {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "ollama":
      return "Ollama";
    case "fallback":
      return "Fallback";
    default:
      return provider;
  }
}

function buildWelcomeMessage(name?: string, language = "en", headline = "") {
  const firstName = name?.split(" ")[0] || "there";
  const greetings: Record<string, string> = {
    en: `Hi ${firstName}. I am your AfyaMind wellness companion. We can talk in your preferred language, work through a short exercise, or make sense of your support plan.`,
    sw: `Habari ${firstName}. Mimi ni msaidizi wako wa AfyaMind. Tunaweza kuzungumza kwa lugha unayopendelea, kufanya zoezi fupi, au kuelewa mpango wako wa msaada.`,
    fr: `Bonjour ${firstName}. Je suis votre assistant AfyaMind. Nous pouvons parler dans votre langue, faire un court exercice, ou clarifier votre plan de soutien.`,
    es: `Hola ${firstName}. Soy tu companero de AfyaMind. Podemos hablar en tu idioma, hacer un ejercicio corto o revisar tu plan de apoyo.`,
    ar: `Hi ${firstName}. I am your AfyaMind wellness companion. We can talk in your preferred language, work through a short exercise, or make sense of your support plan.`,
  };

  const base = greetings[language] || greetings.en;
  return headline ? `${base}\n\nCurrent focus: ${headline}` : base;
}
