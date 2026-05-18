import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { api, type CHWLinkStatus, type CareMessage } from "@/lib/api";
import { MessageSquare, Phone, Send, User, Users } from "lucide-react";

type CareRole = "mental_health_user" | "community_health_worker";

type ConversationTarget = {
  id: number;
  name: string;
  role: CareRole;
  roomId: string;
  subtitle: string;
  detail?: string;
  riskLevel?: string;
};

export default function CareChat() {
  const { user, isUser, isCHW } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const [targets, setTargets] = useState<ConversationTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  const [linkedCHW, setLinkedCHW] = useState<CHWLinkStatus | null>(null);
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, CareMessage[]>>({});
  const [draft, setDraft] = useState("");
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const selectedTarget = useMemo(
    () => targets.find((target) => target.id === selectedTargetId) ?? null,
    [selectedTargetId, targets],
  );
  const selectedRoomId = selectedTarget?.roomId ?? null;
  const messages = selectedRoomId ? messagesByRoom[selectedRoomId] ?? [] : [];

  useEffect(() => {
    let active = true;

    const loadTargets = async () => {
      if (!user) return;
      setLoadingTargets(true);
      setAvailabilityMessage(null);

      try {
        if (isUser) {
          const link = await api.getCHWLink();
          if (!active) return;

          setLinkedCHW(link);
          if (!link.linked || !link.chw_user_id) {
            setTargets([]);
            setSelectedTargetId(null);
            setAvailabilityMessage("Link a registered CHW in CHW Support to unlock care chat.");
            return;
          }

          const target: ConversationTarget = {
            id: link.chw_user_id,
            name: link.chw_name || "Health Worker",
            role: "community_health_worker",
            roomId: buildRoomId(user.id, link.chw_user_id),
            subtitle: link.region ? `${link.region} support` : "Community health support",
            detail: link.phone || undefined,
          };

          setTargets([target]);
          setSelectedTargetId(target.id);
          return;
        }

        if (isCHW) {
          const caseload = await api.getCHWCaseload();
          if (!active) return;

          const nextTargets = caseload.patients.map((patient) => ({
            id: patient.patient_id,
            name: patient.patient_name,
            role: "mental_health_user" as const,
            roomId: buildRoomId(user.id, patient.patient_id),
            subtitle: `${patient.region} · ${patient.total_checkins} check-ins`,
            detail: patient.patient_phone || undefined,
            riskLevel: patient.last_risk_level,
          }));

          const queryTargetId = Number(searchParams.get("target") || 0);
          setTargets(nextTargets);
          setSelectedTargetId(
            nextTargets.some((target) => target.id === queryTargetId)
              ? queryTargetId
              : nextTargets[0]?.id ?? null,
          );
          setAvailabilityMessage(nextTargets.length === 0 ? "Patients will appear here once they are linked or book you." : null);
          return;
        }

        setTargets([]);
        setSelectedTargetId(null);
        setAvailabilityMessage("This account role cannot access care chat.");
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Unable to load care chat.";
        setTargets([]);
        setSelectedTargetId(null);
        setAvailabilityMessage(message);
        toast({ title: "Unable to load care chat", description: message, variant: "destructive" });
      } finally {
        if (active) setLoadingTargets(false);
      }
    };

    void loadTargets();

    return () => {
      active = false;
    };
  }, [isCHW, isUser, searchParams, toast, user]);

  useEffect(() => {
    if (!selectedRoomId) return;
    let active = true;

    const loadMessages = async () => {
      setLoadingMessages(true);
      try {
        const roomMessages = await api.getCareMessages(selectedRoomId);
        if (!active) return;
        setMessagesByRoom((current) => ({ ...current, [selectedRoomId]: roomMessages }));
      } catch (err: unknown) {
        if (!active) return;
        toast({
          title: "Unable to load messages",
          description: err instanceof Error ? err.message : "The conversation could not be loaded.",
          variant: "destructive",
        });
      } finally {
        if (active) setLoadingMessages(false);
      }
    };

    void loadMessages();
    const intervalId = window.setInterval(() => {
      void loadMessages();
    }, 4000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [selectedRoomId, toast]);

  const handleSend = async () => {
    if (!selectedRoomId || !draft.trim()) return;
    setSending(true);
    try {
      const created = await api.createCareMessage({ room_id: selectedRoomId, message: draft.trim() });
      setMessagesByRoom((current) => ({
        ...current,
        [selectedRoomId]: [...(current[selectedRoomId] ?? []), created],
      }));
      setDraft("");
    } catch (err: unknown) {
      toast({
        title: "Unable to send message",
        description: err instanceof Error ? err.message : "The message could not be sent.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="animate-fade-in flex flex-col gap-6 h-[calc(100vh-7rem)]">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl tracking-tight">Care Chat</h1>
        <p className="text-muted-foreground">
          {isUser
            ? "Message your linked CHW and keep support conversations in one place."
            : "Follow up with patients who linked or booked you and keep care coordination moving."}
        </p>
      </header>

      <div className="grid flex-1 gap-6 xl:grid-cols-[0.95fr,1.35fr] min-h-0">
        <aside className="card-elevated p-5 flex flex-col gap-4 min-h-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Contacts</p>
              <h2 className="text-xl mt-2">Available conversations</h2>
            </div>
            <div className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
              {targets.length}
            </div>
          </div>

          {loadingTargets && (
            <div className="text-sm text-muted-foreground">Loading care contacts...</div>
          )}

          {!loadingTargets && availabilityMessage && (
            <div className="rounded-3xl border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
              {availabilityMessage}
              {isUser && (
                <div className="mt-4">
                  <Button asChild variant="outline" className="rounded-full">
                    <Link to="/directory">Open CHW Support</Link>
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3 overflow-y-auto pr-1">
            {targets.map((target) => {
              const isSelected = target.id === selectedTargetId;
              return (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => setSelectedTargetId(target.id)}
                  className={`rounded-3xl border p-4 text-left transition-all ${
                    isSelected ? "border-primary bg-primary/5" : "border-border/70 bg-background/70 hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{target.name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{target.subtitle}</div>
                      {target.detail && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          {target.detail}
                        </div>
                      )}
                    </div>
                    <div className="rounded-full bg-secondary px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      {roleLabel(target.role)}
                    </div>
                  </div>
                  {target.riskLevel && (
                    <div className="mt-3 text-xs text-muted-foreground capitalize">
                      Risk: {target.riskLevel}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="card-elevated p-0 flex flex-col min-h-0 overflow-hidden">
          {selectedTarget ? (
            <>
              <div className="border-b border-border/70 px-6 py-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                        {selectedTarget.role === "community_health_worker" ? <Users className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-primary" />}
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-xl truncate">{selectedTarget.name}</h2>
                        <p className="text-sm text-muted-foreground">{selectedTarget.subtitle}</p>
                      </div>
                    </div>
                  </div>

                  {linkedCHW?.linked && isUser && (
                    <Button asChild variant="outline" className="rounded-full">
                      <Link to="/appointments">Book Session</Link>
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {loadingMessages && messages.length === 0 && (
                  <div className="text-sm text-muted-foreground">Loading conversation...</div>
                )}

                {!loadingMessages && messages.length === 0 && (
                  <div className="rounded-3xl border border-dashed border-border/70 px-5 py-6 text-sm text-muted-foreground">
                    No messages yet. Start with a quick update, question, or follow-up plan.
                  </div>
                )}

                {messages.map((message) => {
                  const isOwn = user?.id === message.sender_id;
                  return (
                    <div key={message.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-3xl px-4 py-3 ${isOwn ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                        <div className="text-[11px] uppercase tracking-[0.16em] opacity-75">
                          {isOwn ? "You" : message.sender_name}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.message}</p>
                        <div className="mt-2 text-[11px] opacity-70">
                          {formatMessageTime(message.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-border/70 px-6 py-5">
                <div className="flex flex-col gap-3">
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={`Message ${selectedTarget.name}...`}
                    className="min-h-[110px] rounded-3xl"
                  />
                  <div className="flex justify-end">
                    <Button onClick={handleSend} disabled={sending || !draft.trim()} className="rounded-2xl">
                      <Send className="mr-2 h-4 w-4" />
                      {sending ? "Sending..." : "Send message"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 opacity-50" />
              <div>
                <p className="font-medium text-foreground">No conversation selected</p>
                <p className="mt-1 text-sm">Choose a patient or CHW on the left to open your care conversation.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function buildRoomId(firstUserId: number, secondUserId: number) {
  const [smallestId, largestId] = [firstUserId, secondUserId].sort((left, right) => left - right);
  return `care-room-${smallestId}-${largestId}`;
}

function roleLabel(role: CareRole) {
  return role === "community_health_worker" ? "Health Worker" : "Patient";
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
