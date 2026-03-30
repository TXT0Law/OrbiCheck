import { MonitorCreateForm } from "@/components/monitor/monitor-create-form";

export default function NewMonitorPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Add monitor
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure how often we should check your target URL.
        </p>
      </div>
      <MonitorCreateForm />
    </div>
  );
}
