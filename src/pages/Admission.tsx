import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, ClipboardList, HeartPulse, Loader2, MoonStar, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { api, type AdmissionResponse, type CheckinRecord } from "@/lib/api";
import {
  admissionSections,
  focusLabel,
  kesslerOptions,
  markAdmissionComplete,
  mdqImpairmentOptions,
  quickExercises,
  recommendationHeadline,
  saveCarePlan,
  severityLabel,
  statusLabelForPlan,
  type CarePlan,
  type ExerciseRecommendation,
  type IntakeOption,
  type RiskLevel,
  type ScreeningResult,
} from "@/lib/wellness";

type AssessmentKey = (typeof admissionSections)[number]["key"];
type StepKey = AssessmentKey | "selection" | "context";
type StepOptionValue = number | boolean;

type AssessmentStep = {
  key: StepKey;
  title: string;
  description: string;
  questions?: Array<{ id: string; prompt: string }>;
  options?: IntakeOption<StepOptionValue>[];
  answers?: Array<StepOptionValue | null>;
  onAnswer?: (index: number, value: StepOptionValue) => void;
};

const recommendedSectionKeys: AssessmentKey[] = ["phq9", "gad7", "cssrs"];

export default function Admission() {
  const { user, isUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [selectedSections, setSelectedSections] = useState<AssessmentKey[]>([]);
  const [phq9Answers, setPHQ9Answers] = useState<number[]>(Array(9).fill(-1));
  const [gad7Answers, setGAD7Answers] = useState<number[]>(Array(7).fill(-1));
  const [pcl5Answers, setPCL5Answers] = useState<number[]>(Array(20).fill(-1));
  const [kesslerAnswers, setKesslerAnswers] = useState<number[]>(Array(10).fill(0));
  const [mdqAnswers, setMDQAnswers] = useState<Array<boolean | null>>(Array(13).fill(null));
  const [auditAnswers, setAUDITAnswers] = useState<number[]>(Array(10).fill(-1));
  const [cssrsAnswers, setCSSRSAnswers] = useState<Array<boolean | null>>(Array(6).fill(null));
  const [mdqConcurrent, setMDQConcurrent] = useState<boolean | null>(null);
  const [mdqImpairment, setMDQImpairment] = useState<number>(-1);
  const [note, setNote] = useState("");
  const [primaryConcern, setPrimaryConcern] = useState("");
  const [safetyContactNumber, setSafetyContactNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CarePlan | null>(null);
  const [recentCheckins, setRecentCheckins] = useState<CheckinRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const assessmentSteps = useMemo<Record<AssessmentKey, AssessmentStep>>(
    () => ({
      phq9: {
        key: "phq9",
        title: admissionSections[0].title,
        description: admissionSections[0].description,
        questions: admissionSections[0].questions,
        options: admissionSections[0].options,
        answers: phq9Answers,
        onAnswer: (index, value) => setPHQ9Answers((current) => updateNumberArray(current, index, value as number)),
      },
      gad7: {
        key: "gad7",
        title: admissionSections[1].title,
        description: admissionSections[1].description,
        questions: admissionSections[1].questions,
        options: admissionSections[1].options,
        answers: gad7Answers,
        onAnswer: (index, value) => setGAD7Answers((current) => updateNumberArray(current, index, value as number)),
      },
      pcl5: {
        key: "pcl5",
        title: admissionSections[2].title,
        description: admissionSections[2].description,
        questions: admissionSections[2].questions,
        options: admissionSections[2].options,
        answers: pcl5Answers,
        onAnswer: (index, value) => setPCL5Answers((current) => updateNumberArray(current, index, value as number)),
      },
      kessler: {
        key: "kessler",
        title: admissionSections[3].title,
        description: admissionSections[3].description,
        questions: admissionSections[3].questions,
        options: kesslerOptions,
        answers: kesslerAnswers,
        onAnswer: (index, value) => setKesslerAnswers((current) => updateNumberArray(current, index, value as number)),
      },
      mdq: {
        key: "mdq",
        title: admissionSections[4].title,
        description: admissionSections[4].description,
        questions: admissionSections[4].questions,
        options: admissionSections[4].options,
        answers: mdqAnswers,
        onAnswer: (index, value) => setMDQAnswers((current) => updateBooleanArray(current, index, value as boolean)),
      },
      audit: {
        key: "audit",
        title: admissionSections[5].title,
        description: admissionSections[5].description,
        questions: admissionSections[5].questions,
        options: admissionSections[5].options,
        answers: auditAnswers,
        onAnswer: (index, value) => setAUDITAnswers((current) => updateNumberArray(current, index, value as number)),
      },
      cssrs: {
        key: "cssrs",
        title: admissionSections[6].title,
        description: admissionSections[6].description,
        questions: admissionSections[6].questions,
        options: admissionSections[6].options,
        answers: cssrsAnswers,
        onAnswer: (index, value) => setCSSRSAnswers((current) => updateBooleanArray(current, index, value as boolean)),
      },
    }),
    [auditAnswers, cssrsAnswers, gad7Answers, kesslerAnswers, mdqAnswers, pcl5Answers, phq9Answers],
  );

  const steps = useMemo<AssessmentStep[]>(
    () => [
      {
        key: "selection",
        title: "Choose your tests",
        description: "Pick only the screenings that feel useful today. You can start with any test, take several, or skip straight to the context step.",
      },
      ...selectedSections.map((sectionKey) => assessmentSteps[sectionKey]),
      {
        key: "context",
        title: "Context and safety",
        description: "Add a little context so your care plan reflects what is going on today.",
      },
    ],
    [assessmentSteps, selectedSections],
  );

  useEffect(() => {
    setStep((current) => Math.min(current, steps.length - 1));
  }, [steps.length]);

  useEffect(() => {
    if (!user) {
      setRecentCheckins([]);
      setHistoryLoading(false);
      return;
    }

    let isActive = true;
    setHistoryLoading(true);

    api.getCheckins()
      .then((items) => {
        if (!isActive) return;
        setRecentCheckins(items.slice(0, 4));
      })
      .catch(() => {
        if (!isActive) return;
        setRecentCheckins([]);
      })
      .finally(() => {
        if (!isActive) return;
        setHistoryLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [user]);

  const answeredCount = useMemo(
    () => countAnsweredQuestions(selectedSections, {
      phq9Answers,
      gad7Answers,
      pcl5Answers,
      kesslerAnswers,
      mdqAnswers,
      mdqConcurrent,
      mdqImpairment,
      auditAnswers,
      cssrsAnswers,
    }),
    [auditAnswers, cssrsAnswers, gad7Answers, kesslerAnswers, mdqAnswers, mdqConcurrent, mdqImpairment, pcl5Answers, phq9Answers, selectedSections],
  );

  const totalQuestions = useMemo(
    () => totalSelectedQuestions(selectedSections),
    [selectedSections],
  );

  const progressPercent = totalQuestions > 0
    ? Math.round((answeredCount / totalQuestions) * 100)
    : Math.round((step / Math.max(steps.length - 1, 1)) * 100);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isUser) {
    return <Navigate to="/dashboard" replace />;
  }

  const currentStep = steps[step];

  const canContinue = (() => {
    switch (currentStep.key) {
      case "selection":
      case "context":
        return true;
      case "phq9":
        return phq9Answers.every((value) => value >= 0);
      case "gad7":
        return gad7Answers.every((value) => value >= 0);
      case "pcl5":
        return pcl5Answers.every((value) => value >= 0);
      case "kessler":
        return kesslerAnswers.every((value) => value >= 1);
      case "mdq":
        return mdqAnswers.every((value) => typeof value === "boolean") && mdqConcurrent !== null && mdqImpairment >= 0;
      case "audit":
        return auditAnswers.every((value) => value >= 0);
      case "cssrs":
        return cssrsAnswers.every((value) => typeof value === "boolean");
      default:
        return true;
    }
  })();

  const selectedStepCards = selectedSections.map((sectionKey) => assessmentSteps[sectionKey]);
  const saveReadiness = step === steps.length - 1
    ? (loading ? "Saving your check-in now." : "Everything is ready to save.")
    : "Complete the selected steps or continue without tests to unlock save.";

  const handleToggleSection = (key: AssessmentKey) => {
    setSelectedSections((current) => {
      if (current.includes(key)) {
        return current.filter((item) => item !== key);
      }
      return [...current, key];
    });
  };

  const handleStartSection = (key: AssessmentKey) => {
    setSelectedSections((current) => {
      const withoutKey = current.filter((item) => item !== key);
      return [key, ...withoutKey];
    });
    setStep(1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const preparedPHQ9Answers = selectedSections.includes("phq9") ? prepareNumberAnswers(phq9Answers, 9, 0, 3) : [];
      const preparedGAD7Answers = selectedSections.includes("gad7") ? prepareNumberAnswers(gad7Answers, 7, 0, 3) : [];
      const preparedPCL5Answers = selectedSections.includes("pcl5") ? prepareNumberAnswers(pcl5Answers, 20, 0, 4) : [];
      const preparedKesslerAnswers = selectedSections.includes("kessler") ? prepareNumberAnswers(kesslerAnswers, 10, 1, 5) : [];
      const preparedMDQAnswers = selectedSections.includes("mdq") ? prepareBooleanAnswers(mdqAnswers, 13) : [];
      const preparedAUDITAnswers = selectedSections.includes("audit") ? prepareNumberAnswers(auditAnswers, 10, 0, 4) : [];
      const preparedCSSRSAnswers = selectedSections.includes("cssrs") ? prepareBooleanAnswers(cssrsAnswers, 6) : [];

      const submittedSections = selectedSections.filter((sectionKey) => {
        switch (sectionKey) {
          case "phq9":
            return preparedPHQ9Answers.length === 9;
          case "gad7":
            return preparedGAD7Answers.length === 7;
          case "pcl5":
            return preparedPCL5Answers.length === 20;
          case "kessler":
            return preparedKesslerAnswers.length === 10;
          case "mdq":
            return preparedMDQAnswers.length === 13 && mdqConcurrent !== null && mdqImpairment >= 0;
          case "audit":
            return preparedAUDITAnswers.length === 10;
          case "cssrs":
            return preparedCSSRSAnswers.length === 6;
          default:
            return false;
        }
      });

      const screenings = buildSelectedScreenings(submittedSections, {
        phq9Answers: preparedPHQ9Answers.length === 9 ? preparedPHQ9Answers : phq9Answers,
        gad7Answers: preparedGAD7Answers.length === 7 ? preparedGAD7Answers : gad7Answers,
        pcl5Answers: preparedPCL5Answers.length === 20 ? preparedPCL5Answers : pcl5Answers,
        kesslerAnswers: preparedKesslerAnswers.length === 10 ? preparedKesslerAnswers : kesslerAnswers,
        mdqAnswers: preparedMDQAnswers.length === 13 ? preparedMDQAnswers : mdqAnswers,
        mdqConcurrent,
        mdqImpairment,
        auditAnswers: preparedAUDITAnswers.length === 10 ? preparedAUDITAnswers : auditAnswers,
        cssrsAnswers: preparedCSSRSAnswers.length === 6 ? preparedCSSRSAnswers : cssrsAnswers,
      });

      const response = await api.startAdmission({
        phq9_answers: preparedPHQ9Answers,
        gad7_answers: preparedGAD7Answers,
        pcl5_answers: preparedPCL5Answers,
        kessler_answers: preparedKesslerAnswers,
        mdq_answers: preparedMDQAnswers,
        mdq_concurrent: preparedMDQAnswers.length === 13 ? mdqConcurrent ?? undefined : undefined,
        mdq_impairment: preparedMDQAnswers.length === 13 && mdqImpairment >= 0 ? mdqImpairment : undefined,
        audit_answers: preparedAUDITAnswers,
        cssrs_answers: preparedCSSRSAnswers,
        note: composeAdmissionNote(primaryConcern, note, safetyContactNumber),
        primary_concern: primaryConcern,
        safety_contact_number: safetyContactNumber,
      });

      const plan = buildCarePlan({
        response,
        screenings,
        selectedSections: submittedSections,
        primaryConcern,
        note,
        safetyContactNumber,
      });

      saveCarePlan(user.id, plan);
      markAdmissionComplete(user.id);
      setResult(plan);
      const updatedCheckins = await api.getCheckins().catch(() => null);
      if (updatedCheckins) {
        setRecentCheckins(updatedCheckins.slice(0, 4));
      }
      toast({
        title: "Check-in saved",
        description: `Status: ${statusLabelForPlan(plan)}`,
      });
    } catch (err: unknown) {
      toast({
        title: "Unable to save check-in",
        description: err instanceof Error ? err.message : "Something went wrong while saving your check-in.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="animate-fade-in flex flex-col gap-8">
        <header className="flex flex-col gap-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-2 text-sm font-medium text-primary shadow-[0_10px_24px_rgba(61,121,89,0.1)]">
            <CheckCircle2 className="h-4 w-4" />
            Check-in saved
          </div>
          <h1 className="text-4xl tracking-tight">{statusLabelForPlan(result)}</h1>
          <p className="max-w-3xl text-muted-foreground">{recommendationHeadline(result)}</p>
        </header>

        <section className="card-elevated grid gap-6 p-8 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {result.riskLevel === "high" ? <ShieldAlert className="h-4 w-4 text-destructive" /> : <HeartPulse className="h-4 w-4 text-primary" />}
              {result.progressLabel}
            </div>
            <p className="text-lg leading-8">{result.recommendationMessage}</p>

            <div className="flex flex-wrap gap-2">
              {result.phq9Severity !== "not_assessed" && (
                <span className="rounded-full border border-white/60 bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  PHQ-9 {result.phq9Score} · {severityLabel(result.phq9Severity)}
                </span>
              )}
              {result.primaryFocuses.map((focus) => (
                <span key={focus} className="rounded-full border border-white/60 bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {focusLabel(focus)}
                </span>
              ))}
            </div>

            {result.screenings.length > 0 ? (
              <div className="space-y-3">
                {result.screenings.map((screening) => (
                  <div key={screening.key} className="glass-surface rounded-2xl px-4 py-3 text-sm">
                    <div className="font-medium">{screening.title}</div>
                    <div className="mt-1 text-muted-foreground">
                      Score {screening.score}/{screening.max_score} · {severityLabel(screening.level)}
                    </div>
                    <div className="mt-2 text-muted-foreground">{screening.summary}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/70 bg-white/60 px-4 py-4 text-sm text-muted-foreground backdrop-blur-xl">
                You skipped the formal tests this time, so this plan is based on your quick check-in context and safety notes.
              </div>
            )}
          </div>

          <div className="glass-surface rounded-[28px] bg-[linear-gradient(135deg,rgba(255,255,255,0.8),rgba(215,244,224,0.56))] p-6">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Next Step
            </div>
            <p className="text-lg">
              {result.riskLevel === "high"
                ? "Use guided care first, contact a CHW or trusted supporter, and do not stay alone if you feel unsafe."
                : result.riskLevel === "medium"
                  ? "Use one of the matched exercises today and line up a follow-up this week."
                  : "Start with a short exercise and keep using check-ins to spot changes early."}
            </p>

            <div className="mt-5 space-y-3">
              {result.recommendedExercises.map((exercise) => (
                <div key={exercise.key} className="glass-surface rounded-2xl px-4 py-3">
                  <div className="font-medium">{exercise.title}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{exercise.duration} · {focusLabel(exercise.focus)}</div>
                  <div className="mt-2 text-sm text-muted-foreground">{exercise.description}</div>
                </div>
              ))}
            </div>

            <Button onClick={() => navigate("/dashboard")} className="mt-6 h-12 w-full rounded-2xl">
              Continue to your care plan
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex flex-col gap-8">
      <header className="space-y-3">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-2 text-sm text-muted-foreground shadow-[0_10px_24px_rgba(61,121,89,0.1)]">
          <AlertTriangle className="h-4 w-4" />
          Flexible check-in
        </div>
        <h1 className="text-4xl tracking-tight">Choose your check-in tests</h1>
        <p className="max-w-3xl text-muted-foreground">
          Break the assessment into smaller pieces and choose only what fits today. You can still save your check-in
          even if you skip the formal tests.
        </p>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[1.75fr,0.62fr] 2xl:grid-cols-[1.9fr,0.58fr]">
        <section className="card-elevated space-y-8 border-2 border-primary/20 p-5 lg:p-8">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{currentStep.title}</span>
              <span>{progressPercent}% complete</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="text-sm text-muted-foreground">
              Step {step + 1}/{steps.length} · {selectedSections.length} test{selectedSections.length === 1 ? "" : "s"} selected
              {totalQuestions > 0 ? ` · ${answeredCount}/${totalQuestions} answers captured` : ""}
            </div>
          </div>

          <div className="glass-surface rounded-[28px] border-2 border-primary/15 p-6 lg:p-8">
            <h2 className="text-2xl tracking-tight">{currentStep.title}</h2>
            <p className="mt-2 text-muted-foreground">{currentStep.description}</p>

            {currentStep.key === "selection" && (
              <div className="mt-6 space-y-6">
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
                  {admissionSections.map((section) => {
                    const isSelected = selectedSections.includes(section.key as AssessmentKey);
                    const isRecommended = recommendedSectionKeys.includes(section.key as AssessmentKey);
                    const startsFirst = selectedSections[0] === section.key;
                    const sectionKey = section.key as AssessmentKey;

                    return (
                      <div
                        key={section.key}
                        className={`min-h-[220px] rounded-[24px] border-2 p-6 text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 text-foreground shadow-[0_16px_32px_rgba(61,121,89,0.12)]"
                            : "border-primary/20 bg-white/70 backdrop-blur-xl hover:border-primary/35"
                        }`}
                      >
                        <button type="button" onClick={() => handleToggleSection(sectionKey)} className="w-full text-left">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-lg font-medium">{section.title}</span>
                            {isRecommended && (
                              <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                Recommended
                              </span>
                            )}
                          </div>
                          <p className="mt-3 text-sm text-muted-foreground">{section.description}</p>
                        </button>

                        <div className="mt-4 flex items-center justify-between gap-3">
                          <span>{section.questions.length} questions</span>
                          <Button
                            type="button"
                            size="sm"
                            variant={startsFirst ? "secondary" : "outline"}
                            onClick={() => handleStartSection(sectionKey)}
                            className="h-9 rounded-full px-4 text-[10px] uppercase tracking-[0.16em]"
                          >
                            {startsFirst ? "Starts first" : "Start here"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-2xl border-2 border-dashed border-primary/20 bg-white/60 px-4 py-4 text-sm text-muted-foreground backdrop-blur-xl">
                  {selectedSections.length > 0
                    ? `You can continue and answer only the tests you selected. The first test in line is ${assessmentSteps[selectedSections[0]].title.toLowerCase()}.`
                    : "No tests selected yet. You can continue with context only and come back for specific screenings later."}
                </div>
              </div>
            )}

            {currentStep.key !== "selection" && currentStep.key !== "context" && currentStep.questions && currentStep.options && currentStep.answers && currentStep.onAnswer && (
              <div className="mt-6 space-y-6">
                {currentStep.questions.map((question, index) => (
                  <div key={question.id} className="glass-surface rounded-[24px] border-2 border-primary/15 p-5 lg:p-6">
                    <p className="mb-4 text-base font-medium">
                      {index + 1}. {question.prompt}
                    </p>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {currentStep.options.map((option) => {
                        const selectedValue = currentStep.answers?.[index];
                        const isSelected = selectedValue === option.value;

                        return (
                          <button
                            key={`${question.id}-${String(option.value)}`}
                            type="button"
                            onClick={() => currentStep.onAnswer?.(index, option.value)}
                            className={`rounded-2xl border-2 px-4 py-3 text-left text-sm transition-all ${
                              isSelected
                                ? "border-primary bg-primary/10 text-foreground shadow-[0_16px_32px_rgba(61,121,89,0.12)]"
                                : "border-primary/15 bg-white/60 backdrop-blur-xl hover:border-primary/30"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {currentStep.key === "mdq" && (
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="glass-surface rounded-[24px] border-2 border-primary/15 p-5">
                      <p className="mb-4 font-medium">Did several of these happen during the same period of time?</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {admissionSections[4].options.map((option) => (
                          <button
                            key={`mdq-concurrent-${String(option.value)}`}
                            type="button"
                            onClick={() => setMDQConcurrent(option.value as boolean)}
                            className={`rounded-2xl border-2 px-4 py-3 text-left text-sm transition-all ${
                              mdqConcurrent === option.value
                                ? "border-primary bg-primary/10 text-foreground shadow-[0_16px_32px_rgba(61,121,89,0.12)]"
                                : "border-primary/15 bg-white/60 backdrop-blur-xl hover:border-primary/30"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="glass-surface rounded-[24px] border-2 border-primary/15 p-5">
                      <p className="mb-4 font-medium">How much of a problem did these experiences cause?</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {mdqImpairmentOptions.map((option) => (
                          <button
                            key={`mdq-impairment-${option.value}`}
                            type="button"
                            onClick={() => setMDQImpairment(option.value)}
                            className={`rounded-2xl border-2 px-4 py-3 text-left text-sm transition-all ${
                              mdqImpairment === option.value
                                ? "border-primary bg-primary/10 text-foreground shadow-[0_16px_32px_rgba(61,121,89,0.12)]"
                                : "border-primary/15 bg-white/60 backdrop-blur-xl hover:border-primary/30"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentStep.key === "context" && (
              <div className="mt-6 grid gap-5">
                <div className="space-y-2">
                  <p className="text-sm font-medium">What feels like the main issue right now?</p>
                  <Input
                    value={primaryConcern}
                    onChange={(event) => setPrimaryConcern(event.target.value)}
                    className="h-12 rounded-2xl"
                    placeholder="Examples: panic, trauma reminders, low mood, sleep, alcohol cravings"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Safety contact number</p>
                  <Input
                    value={safetyContactNumber}
                    onChange={(event) => setSafetyContactNumber(event.target.value)}
                    className="h-12 rounded-2xl"
                    placeholder="+2547..."
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Anything else you want your support plan to consider?</p>
                  <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className="min-h-[140px] rounded-3xl"
                    placeholder="Optional context about sleep, triggers, substance use, support system, or what feels hardest right now."
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((current) => Math.max(current - 1, 0))}
              disabled={step === 0 || loading}
              className="h-12 rounded-2xl"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            {step < steps.length - 1 ? (
              <Button
                type="button"
                onClick={() => setStep((current) => Math.min(current + 1, steps.length - 1))}
                disabled={!canContinue || loading}
                className="h-12 rounded-2xl px-8"
              >
                {currentStep.key === "selection"
                  ? selectedSections.length > 0
                    ? `Start with ${assessmentSteps[selectedSections[0]].title}`
                    : "Continue without tests"
                  : "Next section"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading} className="h-12 rounded-2xl px-8">
                {loading ? "Saving your check-in..." : "Save check-in"}
              </Button>
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-8">
          <div className="card-elevated border-2 border-primary/20 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/75 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Today&apos;s check-in card
                </div>
                <h2 className="mt-4 text-2xl tracking-tight">Visible summary before you save</h2>
              </div>
              <div className="rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-right shadow-[0_10px_24px_rgba(61,121,89,0.08)]">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Progress</div>
                <div className="mt-1 text-lg font-medium">{progressPercent}%</div>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-[1.6rem] border-2 border-primary/15 bg-white/70 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Selected tests</div>
                {selectedStepCards.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedStepCards.map((section) => (
                      <span key={section.key} className="rounded-full border border-white/60 bg-white/85 px-3 py-2 text-xs text-foreground">
                        {section.title}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No formal tests selected. You can still save a context-only check-in.</p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="glass-surface rounded-[1.6rem] border-2 border-primary/15 px-4 py-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Main issue
                  </div>
                  <p className="mt-3 text-sm leading-7 text-foreground">
                    {primaryConcern.trim() || "Add what feels hardest today so your saved plan reflects the real situation."}
                  </p>
                </div>

                <div className="glass-surface rounded-[1.6rem] border-2 border-primary/15 px-4 py-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <MoonStar className="h-3.5 w-3.5" />
                    Notes
                  </div>
                  <p className="mt-3 text-sm leading-7 text-foreground">
                    {note.trim() || "Optional notes about triggers, sleep, support, or what you need this plan to consider."}
                  </p>
                </div>
              </div>

              <div className="glass-surface rounded-[1.6rem] border-2 border-primary/15 px-4 py-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Save status
                </div>
                <p className="mt-3 text-sm leading-7 text-foreground">{saveReadiness}</p>
                <div className="mt-3 text-xs text-muted-foreground">
                  Safety contact: {safetyContactNumber.trim() || "Not added yet"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Answers captured: {answeredCount}/{totalQuestions || 0}
                </div>
              </div>
            </div>
          </div>

          <div className="card-elevated border-2 border-primary/20 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recent saves</div>
                <h2 className="mt-2 text-2xl tracking-tight">Saved check-ins</h2>
              </div>
              {historyLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            <div className="mt-5 space-y-3">
              {!historyLoading && recentCheckins.length === 0 && (
                <div className="rounded-[1.6rem] border-2 border-dashed border-primary/20 bg-white/60 px-4 py-4 text-sm text-muted-foreground">
                  Your saved check-ins will appear here once you submit the first one.
                </div>
              )}

              {recentCheckins.map((item) => (
                <div key={item.id} className="glass-surface rounded-[1.6rem] border-2 border-primary/15 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{formatShortDateTime(item.created_at)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Mood {item.mood}/10 · Stress {item.stress}/10 · Sleep {item.sleep_hours}h
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] ${riskPillClass(item.risk_level)}`}>
                      {item.risk_level}
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {item.note.trim() || "Saved without extra notes."}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function totalSelectedQuestions(selectedSections: AssessmentKey[]) {
  return selectedSections.reduce((sum, sectionKey) => {
    const section = admissionSections.find((item) => item.key === sectionKey);
    if (!section) return sum;
    const extraQuestions = sectionKey === "mdq" ? 2 : 0;
    return sum + section.questions.length + extraQuestions;
  }, 0);
}

function countAnsweredQuestions(
  selectedSections: AssessmentKey[],
  answers: {
    phq9Answers: number[];
    gad7Answers: number[];
    pcl5Answers: number[];
    kesslerAnswers: number[];
    mdqAnswers: Array<boolean | null>;
    mdqConcurrent: boolean | null;
    mdqImpairment: number;
    auditAnswers: number[];
    cssrsAnswers: Array<boolean | null>;
  },
) {
  let count = 0;

  if (selectedSections.includes("phq9")) {
    count += answers.phq9Answers.filter((value) => value >= 0).length;
  }
  if (selectedSections.includes("gad7")) {
    count += answers.gad7Answers.filter((value) => value >= 0).length;
  }
  if (selectedSections.includes("pcl5")) {
    count += answers.pcl5Answers.filter((value) => value >= 0).length;
  }
  if (selectedSections.includes("kessler")) {
    count += answers.kesslerAnswers.filter((value) => value >= 1).length;
  }
  if (selectedSections.includes("mdq")) {
    count += answers.mdqAnswers.filter((value) => typeof value === "boolean").length;
    count += answers.mdqConcurrent !== null ? 1 : 0;
    count += answers.mdqImpairment >= 0 ? 1 : 0;
  }
  if (selectedSections.includes("audit")) {
    count += answers.auditAnswers.filter((value) => value >= 0).length;
  }
  if (selectedSections.includes("cssrs")) {
    count += answers.cssrsAnswers.filter((value) => typeof value === "boolean").length;
  }

  return count;
}

function composeAdmissionNote(primaryConcern: string, note: string, safetyContactNumber: string) {
  const parts = [
    primaryConcern.trim() ? `Primary concern: ${primaryConcern.trim()}` : "",
    note.trim() ? `Notes: ${note.trim()}` : "",
    safetyContactNumber.trim() ? `Safety contact: ${safetyContactNumber.trim()}` : "",
  ].filter(Boolean);

  return parts.join(" | ");
}

function buildSelectedScreenings(
  selectedSections: AssessmentKey[],
  answers: {
    phq9Answers: number[];
    gad7Answers: number[];
    pcl5Answers: number[];
    kesslerAnswers: number[];
    mdqAnswers: Array<boolean | null>;
    mdqConcurrent: boolean | null;
    mdqImpairment: number;
    auditAnswers: number[];
    cssrsAnswers: Array<boolean | null>;
  },
) {
  const screenings: ScreeningResult[] = [];

  if (selectedSections.includes("phq9")) {
    screenings.push(scorePHQ9(answers.phq9Answers));
  }
  if (selectedSections.includes("gad7")) {
    screenings.push(scoreGAD7(answers.gad7Answers));
  }
  if (selectedSections.includes("pcl5")) {
    screenings.push(scorePCL5(answers.pcl5Answers));
  }
  if (selectedSections.includes("kessler")) {
    screenings.push(scoreKessler(answers.kesslerAnswers));
  }
  if (selectedSections.includes("mdq")) {
    screenings.push(scoreMDQ(answers.mdqAnswers, answers.mdqConcurrent, answers.mdqImpairment));
  }
  if (selectedSections.includes("audit")) {
    screenings.push(scoreAUDIT(answers.auditAnswers));
  }
  if (selectedSections.includes("cssrs")) {
    screenings.push(scoreCSSRS(answers.cssrsAnswers));
  }

  return screenings;
}

function buildCarePlan(params: {
  response: AdmissionResponse;
  screenings: ScreeningResult[];
  selectedSections: AssessmentKey[];
  primaryConcern: string;
  note: string;
  safetyContactNumber: string;
}): CarePlan {
  const concernText = `${params.primaryConcern} ${params.note}`.trim();
  const focuses = derivePrimaryFocuses(params.screenings, concernText);
  const screeningRisk = params.screenings.reduce((current, screening) => maxRiskLevel(current, normalizeRiskLevel(screening.risk)), "low" as RiskLevel);
  const textRisk = detectRiskFromText(concernText);
  const backendRisk = normalizeRiskLevel(params.response.risk_level);
  const riskLevel = maxRiskLevel(maxRiskLevel(screeningRisk, textRisk), backendRisk);
  const phq9Screening = params.screenings.find((screening) => screening.key === "phq9");
  const phq9Score = phq9Screening?.score ?? params.response.phq9_score ?? 0;
  const phq9Severity = phq9Screening?.level ?? params.response.phq9_severity ?? "not_assessed";
  const phq9RiskLevel = phq9Screening ? normalizeRiskLevel(phq9Screening.risk) : normalizeRiskLevel(params.response.phq9_risk_level);
  const recommendedExercises = pickRecommendedExercises(focuses);
  const needsLocalRecommendation = riskRank(riskLevel) > riskRank(backendRisk) || !params.response.recommendation_message;

  return {
    admissionId: params.response.admission_id,
    riskLevel,
    phq9Score,
    phq9Severity,
    phq9RiskLevel,
    recommendationType: needsLocalRecommendation ? recommendationTypeForRisk(riskLevel) : params.response.recommendation_type,
    recommendationMessage: needsLocalRecommendation
      ? buildRecommendationMessage(riskLevel, params.screenings.length)
      : params.response.recommendation_message,
    suggestedActions: needsLocalRecommendation || !params.response.suggested_actions?.length
      ? buildSuggestedActions(riskLevel, focuses, params.safetyContactNumber)
      : params.response.suggested_actions,
    screenings: params.screenings,
    primaryFocuses: focuses,
    recommendedExercises,
    progressLabel: buildProgressLabel(params.selectedSections.length, params.screenings.length),
    createdAt: params.response.created_at,
  };
}

function scorePHQ9(answers: number[]): ScreeningResult {
  const score = sumNumbers(answers);
  let level = "minimal";
  if (score >= 20) level = "severe";
  else if (score >= 15) level = "moderately_severe";
  else if (score >= 10) level = "moderate";
  else if (score >= 5) level = "mild";

  let risk: RiskLevel = "low";
  if (score >= 20 || answers[8] >= 2) risk = "high";
  else if (score >= 10 || answers[8] === 1) risk = "medium";

  return {
    key: "phq9",
    title: "Depression screen",
    score,
    max_score: 27,
    level,
    risk,
    summary:
      risk === "high"
        ? "Depressive symptoms and self-harm signals suggest fast follow-up is important."
        : score >= 10
          ? "Depression symptoms are elevated enough to benefit from structured support."
          : "Depression symptoms look mild right now, but continued monitoring still helps.",
  };
}

function scoreGAD7(answers: number[]): ScreeningResult {
  const score = sumNumbers(answers);
  let level = "minimal";
  if (score >= 15) level = "severe";
  else if (score >= 10) level = "moderate";
  else if (score >= 5) level = "mild";

  const risk: RiskLevel = score >= 15 ? "high" : score >= 10 ? "medium" : "low";

  return {
    key: "gad7",
    title: "Anxiety screen",
    score,
    max_score: 21,
    level,
    risk,
    summary:
      risk === "high"
        ? "Anxiety symptoms are intense and may need guided calming plus human follow-up."
        : risk === "medium"
          ? "Anxiety symptoms are moderate and worth addressing with grounding and routine support."
          : "Anxiety symptoms are present at a lower level today.",
  };
}

function scorePCL5(answers: number[]): ScreeningResult {
  const score = sumNumbers(answers);
  let level = "low";
  if (score >= 48) level = "very_high";
  else if (score >= 33) level = "high";
  else if (score >= 20) level = "elevated";

  const risk: RiskLevel = score >= 48 ? "high" : score >= 33 ? "medium" : "low";

  return {
    key: "pcl5",
    title: "PTSD screen",
    score,
    max_score: 80,
    level,
    risk,
    summary:
      risk === "high"
        ? "Trauma-related symptoms are strongly elevated and need a careful support plan."
        : risk === "medium"
          ? "Trauma symptoms are elevated and may benefit from grounding and follow-up care."
          : "Trauma symptoms do not appear strongly elevated from this screen alone.",
  };
}

function scoreKessler(answers: number[]): ScreeningResult {
  const score = sumNumbers(answers);
  let level = "likely_well";
  if (score >= 30) level = "severe";
  else if (score >= 25) level = "moderate";
  else if (score >= 20) level = "mild";

  const risk: RiskLevel = score >= 30 ? "high" : score >= 25 ? "medium" : "low";

  return {
    key: "kessler",
    title: "Psychological distress",
    score,
    max_score: 50,
    level,
    risk,
    summary:
      risk === "high"
        ? "Overall distress is very elevated and points to a heavier support need."
        : risk === "medium"
          ? "Distress is noticeable and worth addressing early."
          : "General distress appears low to mild on this screen.",
  };
}

function scoreMDQ(answers: Array<boolean | null>, concurrent: boolean | null, impairment: number): ScreeningResult {
  const yesCount = answers.filter(Boolean).length;
  const positive = yesCount >= 7 && concurrent === true && impairment >= 2;
  const veryPositive = yesCount >= 10 && concurrent === true && impairment >= 2;
  const level = positive ? (veryPositive ? "strong_positive" : "positive") : "negative";
  const risk: RiskLevel = veryPositive ? "high" : positive ? "medium" : "low";

  return {
    key: "mdq",
    title: "Mood swings and bipolar risk",
    score: yesCount,
    max_score: 13,
    level,
    risk,
    summary:
      positive
        ? "This pattern suggests notable mood elevation or impulsivity signals and is worth clinical follow-up."
        : "This screen does not strongly suggest bipolar-pattern symptoms right now.",
  };
}

function scoreAUDIT(answers: number[]): ScreeningResult {
  const score = sumNumbers(answers);
  let level = "low_risk";
  if (score >= 20) level = "probable_dependence";
  else if (score >= 16) level = "harmful";
  else if (score >= 8) level = "hazardous";

  const risk: RiskLevel = score >= 20 ? "high" : score >= 8 ? "medium" : "low";

  return {
    key: "audit",
    title: "Substance use risk",
    score,
    max_score: 40,
    level,
    risk,
    summary:
      risk === "high"
        ? "Substance-use answers suggest a strong risk pattern that deserves prompt follow-up."
        : risk === "medium"
          ? "Substance use may be contributing to stress and could benefit from a support plan."
          : "This screen does not suggest major substance-use risk today.",
  };
}

function scoreCSSRS(answers: Array<boolean | null>): ScreeningResult {
  const yesCount = answers.filter(Boolean).length;
  const hasHighRiskSignal = answers[3] === true || answers[4] === true || answers[5] === true;
  const hasModerateRiskSignal = answers[0] === true || answers[1] === true || answers[2] === true;
  const risk: RiskLevel = hasHighRiskSignal ? "high" : hasModerateRiskSignal ? "medium" : "low";
  const level = hasHighRiskSignal ? "acute" : hasModerateRiskSignal ? "elevated" : "none_reported";

  return {
    key: "cssrs",
    title: "Suicide risk screen",
    score: yesCount,
    max_score: 6,
    level,
    risk,
    summary:
      risk === "high"
        ? "Suicidal intent, planning, or past action signals mean immediate human support is safest."
        : risk === "medium"
          ? "Suicidal thoughts were reported, so support should happen soon and not be delayed."
          : "No suicidal thoughts or actions were reported on this screen.",
  };
}

function derivePrimaryFocuses(screenings: ScreeningResult[], concernText: string) {
  const focuses = new Set<string>();

  for (const screening of screenings) {
    if (screening.key === "phq9" && screening.score >= 5) focuses.add("depression");
    if (screening.key === "gad7" && screening.score >= 5) focuses.add("anxiety");
    if (screening.key === "pcl5" && screening.score >= 20) focuses.add("trauma");
    if (screening.key === "kessler" && screening.score >= 20) focuses.add("psychological_distress");
    if (screening.key === "mdq" && screening.score >= 7) focuses.add("mood_regulation");
    if (screening.key === "audit" && screening.score >= 8) focuses.add("substance_use");
    if (screening.key === "cssrs" && screening.score >= 1) focuses.add("safety");
  }

  const normalizedText = concernText.toLowerCase();
  if (/(panic|anxious|worry|overthinking)/.test(normalizedText)) focuses.add("anxiety");
  if (/(sad|depress|hopeless|low mood)/.test(normalizedText)) focuses.add("depression");
  if (/(sleep|insomnia|nightmare|tired)/.test(normalizedText)) focuses.add("sleep");
  if (/(trauma|flashback|trigger|reminder)/.test(normalizedText)) focuses.add("trauma");
  if (/(drink|alcohol|substance|craving)/.test(normalizedText)) focuses.add("substance_use");
  if (/(suicide|self harm|kill myself|unsafe)/.test(normalizedText)) focuses.add("safety");

  if (focuses.size === 0) {
    focuses.add("general_wellness");
  }

  return Array.from(focuses);
}

function pickRecommendedExercises(focuses: string[]) {
  const picked: ExerciseRecommendation[] = [];
  const addExercise = (key: string) => {
    const match = quickExercises.find((exercise) => exercise.key === key);
    if (match && !picked.some((exercise) => exercise.key === match.key)) {
      picked.push(match);
    }
  };

  if (focuses.includes("anxiety") || focuses.includes("safety") || focuses.includes("trauma")) {
    addExercise("grounding_54321");
  }
  if (focuses.includes("sleep") || focuses.includes("mood_regulation") || focuses.includes("anxiety")) {
    addExercise("box_breathing");
  }
  if (focuses.includes("depression") || focuses.includes("psychological_distress") || focuses.includes("general_wellness")) {
    addExercise("reset_walk");
  }

  for (const exercise of quickExercises) {
    addExercise(exercise.key);
  }

  return picked.slice(0, 3);
}

function buildProgressLabel(selectedCount: number, completedCount: number) {
  if (selectedCount === 0) {
    return "Context-only check-in completed";
  }
  return `${completedCount}/${selectedCount} selected screen${selectedCount === 1 ? "" : "s"} completed`;
}

function buildRecommendationMessage(riskLevel: RiskLevel, screeningCount: number) {
  if (riskLevel === "high") {
    return "Your chosen check-in suggests you need fast human support. Start with guided care and reach out to a CHW, clinician, or trusted person now.";
  }
  if (riskLevel === "medium") {
    return "Your selected screens suggest moderate strain. Use one grounding or recovery exercise today and plan a follow-up this week.";
  }
  if (screeningCount === 0) {
    return "This is a lightweight check-in without formal tests. Keep listening to changes in your mood and add a screen next time if you want a sharper plan.";
  }
  return "Your selected screens do not suggest urgent risk right now. Keep your support routine small, steady, and easy to repeat.";
}

function buildSuggestedActions(riskLevel: RiskLevel, focuses: string[], safetyContactNumber: string) {
  if (riskLevel === "high") {
    return [
      "Open guided care immediately and stay connected to another person.",
      safetyContactNumber.trim() ? `Call or message your safety contact at ${safetyContactNumber.trim()}.` : "Contact a CHW, therapist, or trusted supporter now.",
      "Use local emergency or crisis support if you might act on suicidal thoughts.",
    ];
  }

  if (riskLevel === "medium") {
    return [
      focuses.includes("anxiety") ? "Use a grounding or breathing exercise today." : "Choose one short recovery exercise today.",
      "Book or request a follow-up with a CHW, therapist, or trusted supporter this week.",
      "Keep journaling or checking in daily so changes are easier to spot early.",
    ];
  }

  return [
    "Keep daily check-ins light and consistent.",
    focuses.includes("sleep") ? "Protect your sleep routine tonight with one small calming habit." : "Choose one small self-care action you can repeat today.",
    "Reach out early if symptoms start climbing.",
  ];
}

function recommendationTypeForRisk(riskLevel: RiskLevel) {
  if (riskLevel === "high") return "schedule_chw_meeting";
  if (riskLevel === "medium") return "advice";
  return "motivation";
}

function detectRiskFromText(text: string): RiskLevel {
  const normalized = text.toLowerCase().trim();
  if (!normalized) return "low";
  if (/(suicide|kill myself|end my life|self harm|unsafe)/.test(normalized)) return "high";
  if (/(hopeless|panic|anxious|alone|can'?t sleep|overwhelmed)/.test(normalized)) return "medium";
  return "low";
}

function normalizeRiskLevel(value?: string): RiskLevel {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "low";
}

function riskRank(value: RiskLevel) {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function maxRiskLevel(left: RiskLevel, right: RiskLevel): RiskLevel {
  return riskRank(left) >= riskRank(right) ? left : right;
}

function sumNumbers(values: number[]) {
  return values.reduce((sum, value) => sum + Math.max(value, 0), 0);
}

function updateNumberArray(current: number[], index: number, value: number) {
  return current.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function updateBooleanArray(current: Array<boolean | null>, index: number, value: boolean) {
  return current.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function prepareNumberAnswers(values: number[], expectedLength: number, minValue: number, maxValue: number) {
  if (values.length !== expectedLength) return [];
  if (!values.every((value) => value >= minValue && value <= maxValue)) return [];
  return [...values];
}

function prepareBooleanAnswers(values: Array<boolean | null>, expectedLength: number) {
  if (values.length !== expectedLength) return [];
  if (!values.every((value) => typeof value === "boolean")) return [];
  return values.filter((value): value is boolean => typeof value === "boolean");
}

function formatShortDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function riskPillClass(riskLevel: string) {
  if (riskLevel === "high") {
    return "bg-destructive/12 text-destructive";
  }
  if (riskLevel === "medium") {
    return "bg-sun/55 text-foreground";
  }
  return "bg-primary/10 text-primary";
}
