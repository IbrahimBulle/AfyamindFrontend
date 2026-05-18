import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BadgeCheck,
  Brain,
  Calendar,
  FileDown,
  Gift,
  Heart,
  MessageCircle,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { api, type CHWCertificateRequest, type DashboardSummary, type CertificateResponse, type SessionProgressStatus, type VoiceHelplineResponse } from "@/lib/api";
import { downloadCertificatePdf, formatCertificateDate, formatCertificateNumber } from "@/lib/certificate";
import {
  focusLabel,
  getCarePlan,
  getSessionProgress,
  quickExercises,
  recommendationHeadline,
  saveSessionProgress,
  sessionTasks,
  severityLabel,
  statusLabelForPlan,
  isSessionComplete,
  type CarePlan,
  type SessionProgress,
} from "@/lib/wellness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function Dashboard() {
  const { user, isUser } = useAuth();
  const { toast } = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [carePlan, setCarePlan] = useState<CarePlan | null>(null);
  const [progress, setProgress] = useState<SessionProgress>(getSessionProgress(user?.id));
  const [sessionStatus, setSessionStatus] = useState<SessionProgressStatus | null>(null);
  const [certificateName, setCertificateName] = useState(user?.name || "");
  const [latestCertificate, setLatestCertificate] = useState<CertificateResponse | null>(null);
  const [chwCertificateRequests, setChwCertificateRequests] = useState<CHWCertificateRequest[]>([]);
  const [generating, setGenerating] = useState(false);
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [helplineLoading, setHelplineLoading] = useState(false);
  const [helplineScript, setHelplineScript] = useState<VoiceHelplineResponse | null>(null);

  useEffect(() => {
    api.getDashboardSummary().then(setSummary).catch(console.error);
  }, []);

  useEffect(() => {
    setCertificateName(user?.name || "");
    setCarePlan(getCarePlan(user?.id));
    setProgress(getSessionProgress(user?.id));
  }, [user?.id, user?.name]);

  useEffect(() => {
    if (!isUser || !user?.id) {
      setSessionStatus(null);
      return;
    }

    let active = true;

    api.getSessionProgress()
      .then((status) => {
        if (!active) return;
        setSessionStatus(status);
        setProgress({
          exerciseComplete: status.exercise_complete,
          chwChatComplete: status.chw_chat_complete,
          guidanceComplete: status.guidance_complete,
          reflection: status.reflection || "",
          updatedAt: status.updated_at || null,
        });
      })
      .catch(() => {
        if (!active) return;
        setSessionStatus(null);
      });

    return () => {
      active = false;
    };
  }, [isUser, user?.id]);

  useEffect(() => {
    if (isUser) {
      setChwCertificateRequests([]);
      return;
    }

    let active = true;
    api.getCHWCertificateRequests()
      .then((items) => {
        if (active) setChwCertificateRequests(items);
      })
      .catch(() => {
        if (active) setChwCertificateRequests([]);
      });

    return () => {
      active = false;
    };
  }, [isUser]);

  const statCards = summary ? (
    isUser
      ? [
          {
            icon: <Heart className="h-5 w-5" />,
            label: "Check-ins",
            value: summary.total_checkins || 0,
            color: "bg-clay/20 text-clay-foreground",
          },
          {
            icon: <Calendar className="h-5 w-5" />,
            label: "Appointments",
            value: summary.total_appointments || 0,
            color: "bg-sage/20 text-sage-foreground",
          },
          {
            icon: <MessageCircle className="h-5 w-5" />,
            label: "Community",
            value: summary.total_community_messages || 0,
            color: "bg-sun/40 text-sun-foreground",
          },
          {
            icon: <Gift className="h-5 w-5" />,
            label: "Points",
            value: summary.points || 0,
            color: "bg-primary/10 text-foreground",
          },
        ]
      : [
          {
            icon: <Users className="h-5 w-5" />,
            label: "Patients",
            value: summary.total_checkins || 0,
            color: "bg-clay/20 text-clay-foreground",
          },
          {
            icon: <AlertTriangle className="h-5 w-5" />,
            label: "High Risk",
            value: summary.total_risk_events || 0,
            color: "bg-destructive/10 text-destructive",
          },
          {
            icon: <Calendar className="h-5 w-5" />,
            label: "Appointments",
            value: summary.total_appointments || 0,
            color: "bg-sage/20 text-sage-foreground",
          },
          {
            icon: <MessageCircle className="h-5 w-5" />,
            label: "Community",
            value: summary.total_community_messages || 0,
            color: "bg-sun/40 text-sun-foreground",
          },
        ]
  ) : [];

  const tasks = useMemo(() => sessionTasks(carePlan), [carePlan]);
  const sessionComplete = sessionStatus?.checklist_complete ?? isSessionComplete(carePlan, progress);
  const canGenerateCertificate = sessionStatus?.can_generate_certificate ?? sessionComplete;
  const previewName = certificateName.trim() || user?.name || "Your Name";
  const certificateNumber = latestCertificate
    ? formatCertificateNumber(latestCertificate.certificate_id, latestCertificate.created_at)
    : formatCertificateNumber(undefined, new Date().toISOString());
  const certificateIssuedOn = latestCertificate
    ? formatCertificateDate(latestCertificate.created_at)
    : sessionComplete
      ? "Assigned on download"
      : "Available after completion";
  const certificateStatus = latestCertificate?.status || (sessionComplete ? "Ready for issue" : "Locked until session is complete");
  const certificateSummary =
    latestCertificate?.summary ||
    (sessionComplete
      ? sessionStatus?.requires_chw_approval && !sessionStatus?.certificate_approved
        ? "Your checklist is complete. Request CHW approval to unlock the verified certificate."
        : "Your generated certificate will include a unique certificate number, backend-issued status, and session verification details."
      : "Finish each tracked session step to unlock official certificate issuance.");
  const certificateAverageMood =
    latestCertificate && latestCertificate.avg_mood > 0
      ? `${latestCertificate.avg_mood.toFixed(1)}/10`
      : "Calculated on issue";
  const pendingCertificateApprovals = chwCertificateRequests.filter((request) => !request.certificate_approved);

  const updateProgress = async (changes: Partial<SessionProgress>) => {
    if (!user?.id) return;
    const nextProgress = {
      ...progress,
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    setProgress(nextProgress);
    saveSessionProgress(user.id, nextProgress);

    try {
      const status = await api.updateSessionProgress({
        exercise_complete: changes.exerciseComplete,
        chw_chat_complete: changes.chwChatComplete,
        guidance_complete: changes.guidanceComplete,
        reflection: changes.reflection,
      });
      setSessionStatus(status);
    } catch (err) {
      toast({
        title: "Unable to sync session progress",
        description: err instanceof Error ? err.message : "Progress could not be saved to the backend.",
        variant: "destructive",
      });
    }
  };

  const handleGenerateCertificate = async () => {
    if (!canGenerateCertificate) return;
    setGenerating(true);
    try {
      const certificate: CertificateResponse = await api.generateCertification();
      setLatestCertificate(certificate);
      downloadCertificatePdf({
        recipientName: certificateName,
        status: certificate.status,
        summary: certificate.summary,
        sessionDate: certificate.created_at,
        certificateId: certificate.certificate_id,
        avgMood: certificate.avg_mood,
      });
      toast({
        title: "Certificate ready",
        description: "Your wellness session certificate was downloaded as a PDF.",
      });
    } catch (err: unknown) {
      toast({
        title: "Certificate failed",
        description: err instanceof Error ? err.message : "Unable to generate the certificate right now.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleRequestApproval = async () => {
    setRequestingApproval(true);
    try {
      const status = await api.requestCertificateApproval();
      setSessionStatus(status);
      toast({
        title: "Approval requested",
        description: "Your CHW can now review your completed session and approve certificate download.",
      });
    } catch (err: unknown) {
      toast({
        title: "Unable to request approval",
        description: err instanceof Error ? err.message : "The request could not be sent right now.",
        variant: "destructive",
      });
    } finally {
      setRequestingApproval(false);
    }
  };

  const handleLoadHelpline = async () => {
    setHelplineLoading(true);
    try {
      const response = await api.getVoiceHelpline({ language: user?.language });
      setHelplineScript(response);
      toast({
        title: "Voice helpline ready",
        description: "Loaded the backend helpline script for your current language.",
      });
    } catch (err: unknown) {
      toast({
        title: "Unable to load helpline",
        description: err instanceof Error ? err.message : "Unable to load the helpline script right now.",
        variant: "destructive",
      });
    } finally {
      setHelplineLoading(false);
    }
  };

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col gap-10 animate-fade-in">
      <header>
        <span className="text-sm font-medium text-muted-foreground tracking-wide uppercase">{today}</span>
        <h1 className="text-4xl lg:text-5xl tracking-tight mt-3">
          Good {getTimeOfDay()}, {user?.name?.split(" ")[0]}.
          <br />
          <span className="text-muted-foreground">
            {isUser ? "Your wellness plan is ready for today." : "Your patients need you."}
          </span>
        </h1>
      </header>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <StatCard key={card.label} icon={card.icon} label={card.label} value={card.value} color={card.color} />
          ))}
        </div>
      )}

      {isUser && (
        <section className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
          <div className="card-elevated overflow-hidden">
            <div className="bg-gradient-to-r from-clay/20 via-primary/10 to-sage/15 p-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                {carePlan?.riskLevel === "high" ? <ShieldAlert className="h-4 w-4 text-destructive" /> : <Brain className="h-4 w-4 text-primary" />}
                Current status
              </div>
              <h2 className="mt-4 text-3xl tracking-tight">{statusLabelForPlan(carePlan)}</h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">{recommendationHeadline(carePlan)}</p>
              {carePlan && (
                <div className="mt-5 flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span className="rounded-full bg-background/80 px-4 py-2">PHQ-9 score: {carePlan.phq9Score}</span>
                  <span className="rounded-full bg-background/80 px-4 py-2">Severity: {severityLabel(carePlan.phq9Severity)}</span>
                  {carePlan.primaryFocuses.map((focus) => (
                    <span key={focus} className="rounded-full bg-background/80 px-4 py-2">
                      Focus: {focusLabel(focus)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 p-8">
              <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Recommended path</p>
              {(carePlan?.suggestedActions || [
                "Complete your screening intake to unlock the right support path.",
                "Use the AI companion for guided exercises.",
                "Reach out early if symptoms worsen.",
              ]).map((action) => (
                <div key={action} className="rounded-2xl border border-border/70 bg-background/70 px-4 py-4 text-sm">
                  {action}
                </div>
              ))}
            </div>
          </div>

          <div className="card-elevated p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl tracking-tight">Recommended next move</h2>
                <p className="text-sm text-muted-foreground">
                  {carePlan?.riskLevel === "high"
                    ? "Go for guidance first, then talk to a CHW or trusted supporter."
                    : carePlan?.riskLevel === "medium"
                      ? "Chat with a CHW and add one short exercise today."
                      : "Take a short exercise and stay consistent with check-ins."}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              <QuickLinkCard
                href={carePlan?.riskLevel === "high" ? "/resources" : "/ai-chat"}
                title={carePlan?.riskLevel === "high" ? "Open guided care" : "Open AI companion"}
                description={carePlan?.riskLevel === "high" ? "Start the most supportive path immediately." : "Use a guided conversation in your chosen language."}
              />
              <QuickLinkCard
                href="/directory"
                title="Open CHW support"
                description="Link or review your CHW and use the follow-up appointment flow."
              />
              <QuickLinkCard
                href="/directory"
                title="Find CHW support"
                description="Browse community health workers and connect the right person."
              />
            </div>
          </div>
        </section>
      )}

      {isUser && (
        <section className="grid gap-6 lg:grid-cols-[1fr,1fr]">
          <div className="card-elevated p-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl tracking-tight">Session tracker</h2>
                <p className="text-sm text-muted-foreground">
                  Mark each part of your support session as you complete it.
                </p>
              </div>
              <span className="rounded-full bg-secondary px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {tasks.filter((task) => progress[task.key as keyof SessionProgress] === true).length}/{tasks.length || 0} complete
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {tasks.map((task) => (
                <div key={task.key} className="rounded-[28px] border border-border/70 bg-background/70 p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
                    </div>
                    <div className="flex gap-3">
                      <Link
                        to={task.href}
                        className="inline-flex h-11 items-center justify-center rounded-2xl border border-border px-4 text-sm font-medium transition-colors hover:border-primary/30"
                      >
                        Open
                      </Link>
                      <Button
                        type="button"
                        variant={progress[task.key as keyof SessionProgress] === true ? "secondary" : "default"}
                        className="h-11 rounded-2xl"
                        onClick={() => void updateProgress({ [task.key]: !progress[task.key as keyof SessionProgress] } as Partial<SessionProgress>)}
                      >
                        {progress[task.key as keyof SessionProgress] === true ? "Completed" : "Mark done"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <p className="mb-2 text-sm font-medium">Session reflection</p>
              <Textarea
                value={progress.reflection}
                onChange={(event) => setProgress((current) => ({ ...current, reflection: event.target.value }))}
                onBlur={() => void updateProgress({ reflection: progress.reflection })}
                className="min-h-[140px] rounded-3xl"
                placeholder="Optional: add a short note about what helped, what still feels heavy, and your next step."
              />
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="card-elevated p-8">
              <h2 className="text-2xl tracking-tight">Short exercises</h2>
              <p className="mt-2 text-sm text-muted-foreground">Use the exercises matched to your screening results and then track them in your session.</p>
              <div className="mt-5 space-y-3">
                {(carePlan?.recommendedExercises?.length ? carePlan.recommendedExercises : quickExercises).map((exercise) => (
                  <div key={exercise.title} className="rounded-2xl border border-border/70 bg-background/70 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{exercise.title}</p>
                      <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">{exercise.duration}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{exercise.description}</p>
                    {"focus" in exercise && (
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">{focusLabel(exercise.focus)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="card-elevated overflow-hidden">
              <div className="bg-gradient-to-br from-sun/35 via-background to-primary/10 p-8">
                <div className="inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  <FileDown className="h-4 w-4" />
                  Session certificate
                </div>
                <h2 className="mt-4 text-2xl tracking-tight">Create a polished PDF certificate</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Review the live preview, choose the recipient name, and generate a certificate with a backend-issued record number.
                </p>
              </div>

              <div className="grid gap-8 p-8 xl:grid-cols-[0.9fr,1.1fr]">
                <div>
                  <label className="mb-2 block text-sm font-medium">Certificate name</label>
                  <Input
                    value={certificateName}
                    onChange={(event) => setCertificateName(event.target.value)}
                    className="h-12 rounded-2xl"
                    placeholder="Enter the name to show on the certificate"
                  />

                  <div className="mt-5 grid gap-3">
                    <CertificateTrustRow
                      icon={<BadgeCheck className="h-4 w-4 text-primary" />}
                      title="Unique certificate number"
                      description="Each issued PDF receives a backend record number for a more legitimate certificate trail."
                    />
                    <CertificateTrustRow
                      icon={<ShieldCheck className="h-4 w-4 text-primary" />}
                      title="Issued from your session data"
                      description="Status and summary are generated from your actual wellness record, not typed in manually."
                    />
                    <CertificateTrustRow
                      icon={<Award className="h-4 w-4 text-primary" />}
                      title="Designed for sharing"
                      description="The final PDF uses a cleaner certificate layout that looks presentable on screen and when printed."
                    />
                  </div>

                  <p className="mt-5 text-sm text-muted-foreground">
                    {sessionComplete
                      ? sessionStatus?.requires_chw_approval && !sessionStatus?.certificate_approved
                        ? sessionStatus?.certificate_requested
                          ? "Your checklist is complete. Waiting for CHW approval before download."
                          : "Your checklist is complete. Ask your CHW to approve certificate download."
                        : "Your session is complete. You can generate the certificate now."
                      : "Complete all tracked steps before generating the certificate."}
                  </p>

                  {sessionStatus?.requires_chw_approval && !sessionStatus.certificate_approved && sessionComplete && (
                    <Button
                      onClick={handleRequestApproval}
                      disabled={requestingApproval || sessionStatus.certificate_requested}
                      variant="outline"
                      className="mt-5 h-12 rounded-2xl"
                    >
                      {sessionStatus.certificate_requested ? "Approval requested" : requestingApproval ? "Requesting approval..." : "Request CHW approval"}
                    </Button>
                  )}

                  <Button
                    onClick={handleGenerateCertificate}
                    disabled={!canGenerateCertificate || generating || !certificateName.trim()}
                    className="mt-5 h-12 rounded-2xl"
                  >
                    {generating ? "Generating certificate..." : "Generate verified PDF"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>

                <div className="rounded-[32px] border border-white/65 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.84),rgba(227,244,232,0.55))] p-3 shadow-[0_24px_50px_rgba(61,121,89,0.12)]">
                  <div className="rounded-[28px] border border-[#d7caa4]/80 bg-[linear-gradient(180deg,rgba(255,251,240,0.98),rgba(247,242,226,0.95))] px-6 py-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_14px_30px_rgba(115,98,54,0.08)]">
                    <div className="flex items-start justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      <div>
                        <p>AfyaMind wellness record</p>
                        <p className="mt-1 font-medium text-foreground/80">{certificateNumber}</p>
                      </div>
                      <span className="rounded-full border border-[#d7caa4]/70 bg-white/75 px-3 py-1 text-[10px] font-medium text-foreground/80">
                        {latestCertificate ? "Verified" : canGenerateCertificate ? "Ready" : sessionStatus?.certificate_requested ? "Awaiting CHW" : "Locked"}
                      </span>
                    </div>

                    <div className="mt-10 text-center">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Certificate of completion</p>
                      <h3 className="mt-3 font-serif text-3xl tracking-tight text-foreground">Wellness Session Certificate</h3>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        Official recognition of a completed guided AfyaMind wellness session.
                      </p>

                      <p className="mt-8 text-xs uppercase tracking-[0.22em] text-muted-foreground">Presented to</p>
                      <p className="mt-2 font-serif text-4xl tracking-tight text-foreground">{previewName}</p>
                    </div>

                    <div className="mt-8 rounded-[24px] border border-[#d7caa4]/70 bg-white/55 px-4 py-4">
                      <p className="text-sm font-medium text-foreground">{certificateStatus}</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{certificateSummary}</p>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      <CertificateMeta label="Issued" value={certificateIssuedOn} />
                      <CertificateMeta label="Average mood" value={certificateAverageMood} />
                    </div>

                    <div className="mt-8 flex items-end justify-between gap-4">
                      <div>
                        <div className="h-px w-36 bg-foreground/25" />
                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">AfyaMind Care Team</p>
                        <p className="mt-1 text-xs text-muted-foreground">Digital issuer</p>
                      </div>

                      <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-primary/15 bg-primary/10 text-center shadow-[0_12px_26px_rgba(61,121,89,0.12)]">
                        <div>
                          <p className="text-[9px] font-medium uppercase tracking-[0.18em] text-primary">Verified</p>
                          <p className="mt-1 text-[8px] uppercase tracking-[0.12em] text-muted-foreground">Session record</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {isUser && (
        <section className="card-elevated p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl tracking-tight">Voice Helpline</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Load a short guided safety script from the backend when you need a calming prompt.
              </p>
            </div>
            <Button type="button" className="rounded-2xl" disabled={helplineLoading} onClick={() => void handleLoadHelpline()}>
              {helplineLoading ? "Loading..." : "Load script"}
            </Button>
          </div>
          {helplineScript && (
            <div className="mt-5 rounded-2xl border border-border/60 bg-background/70 px-4 py-4">
              <p className="text-sm leading-6">{helplineScript.script}</p>
            </div>
          )}
        </section>
      )}

      {summary?.last_risk_level && summary.last_risk_level !== "low" && isUser && (
        <div
          className={`card-elevated p-6 flex items-center gap-4 ${
            summary.last_risk_level === "high" ? "border-destructive/30 bg-destructive/5" : "border-accent bg-accent/30"
          }`}
        >
          <Brain className="h-6 w-6 text-foreground" />
          <div>
            <p className="font-medium">
              Your last risk level: <span className="capitalize">{summary.last_risk_level}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {summary.last_risk_level === "high"
                ? "Please use guided support right away and do not stay alone if you feel unsafe."
                : "Keep monitoring your wellness and continue your support plan."}
            </p>
          </div>
        </div>
      )}

      {isUser && summary && !summary.chw_linked && (
        <div className="card-elevated p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-primary/20 bg-primary/5">
          <div>
            <p className="font-medium">You have not linked a Community Health Worker yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Browse available CHWs and add one to your care team for follow-up support.
            </p>
          </div>
          <Link
            to="/directory"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Find CHW Support
          </Link>
        </div>
      )}

      {!isUser && (
        <section className="card-elevated p-8 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl tracking-tight">Certificate Approvals</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Patients who completed their exercises and asked for certificate release appear here first.
              </p>
            </div>
            <span className="rounded-full bg-secondary px-4 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {pendingCertificateApprovals.length} pending
            </span>
          </div>

          {pendingCertificateApprovals.length > 0 ? (
            <div className="space-y-3">
              {pendingCertificateApprovals.slice(0, 3).map((request) => (
                <div key={request.patient_id} className="rounded-2xl border border-border/70 bg-background/70 px-4 py-4">
                  <div className="font-medium">{request.patient_name}</div>
                  <div className="mt-1 text-sm text-muted-foreground capitalize">
                    {request.current_risk_level} risk · requested {request.certificate_requested_at ? formatCertificateDate(request.certificate_requested_at) : "today"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 px-4 py-4 text-sm text-muted-foreground">
              No certificate approval requests yet.
            </div>
          )}

          <Button asChild className="self-start rounded-2xl">
            <Link to="/caseload">Open Caseload</Link>
          </Button>
        </section>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="card-elevated p-6 flex flex-col gap-3">
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${color}`}>{icon}</div>
      <div>
        <div className="text-3xl font-serif tracking-tight">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function QuickLinkCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      to={href}
      className="rounded-[28px] border border-border/70 bg-background/80 p-5 transition-all hover:border-primary/30 hover:shadow-[0_16px_30px_rgba(60,53,43,0.08)]"
    >
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </Link>
  );
}

function CertificateTrustRow({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/55 px-4 py-4 shadow-[0_10px_20px_rgba(61,121,89,0.08)]">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10">{icon}</div>
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

function CertificateMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#d7caa4]/60 bg-white/55 px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
