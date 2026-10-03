"use client";

import { useState, useTransition } from "react";

import {
  processPunchesNow,
  regenerateDeviceKey,
  registerDevice,
  setDeviceActive,
} from "@/app/(app)/attendance/devices/actions";
import { DrawerForm } from "@/components/drawer-form";
import { ManageForm } from "@/components/manage-form";
import { SlideOver } from "@/components/slide-over";
import { Alert, Button } from "@/components/ui";

const DEVICE_TYPE_OPTIONS = [
  { value: "FINGERPRINT", label: "Fingerprint" },
  { value: "RFID", label: "RFID card" },
  { value: "FACE", label: "Face" },
  { value: "IRIS", label: "Iris" },
];

export function AddDevice() {
  return (
    <DrawerForm
      trigger="Add device"
      title="Register a biometric device"
      description="Issues an API key the device uses to push punches"
      width="w-[30rem]"
    >
      <ManageForm
        bare
        title="Register a device"
        action={registerDevice}
        submitLabel="Register device"
        footnote="The API key is shown once, right after you save. Enter students on the device under their admission number (staff: employee id)."
        fields={[
          { name: "name", label: "Name", required: true, placeholder: "Main gate reader" },
          { name: "serialNumber", label: "Serial number", required: true, placeholder: "ZK-1023", half: true },
          { name: "deviceType", label: "Type", type: "select", required: true, options: DEVICE_TYPE_OPTIONS, defaultValue: "FINGERPRINT", half: true },
          { name: "location", label: "Location", placeholder: "Main gate", half: true },
          { name: "ipAddress", label: "IP address", placeholder: "192.168.1.50", half: true },
        ]}
      />
    </DrawerForm>
  );
}

export function ProcessPunchesButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(async () => setResult((await processPunchesNow()).message))}
      >
        {pending ? "Processing…" : "Reprocess unmatched"}
      </Button>
      {result ? <span className="text-[11px] text-muted">{result}</span> : null}
    </span>
  );
}

export function DeviceActions({
  deviceId,
  name,
  isActive,
}: {
  deviceId: string;
  name: string;
  isActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => setResult(await action()));
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Manage
      </Button>

      <SlideOver open={open} onClose={() => setOpen(false)} label={`Manage ${name}`} width="w-[28rem]">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{name}</h2>
            <p className="mt-0.5 text-xs text-muted">API key and status</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded-[var(--radius-base)] p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
              <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {result ? (
            <Alert tone={result.ok ? "success" : "danger"}>
              <span className="break-all">{result.message}</span>
            </Alert>
          ) : null}

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-strong">API key</p>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => regenerateDeviceKey(deviceId))}
            >
              Regenerate key
            </Button>
            <p className="mt-1.5 text-[11px] text-muted">
              Issues a new key and invalidates the old one. The new key is shown once, above.
            </p>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-1.5 text-xs font-medium text-muted-strong">Status</p>
            {isActive ? (
              <Button
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={() => run(() => setDeviceActive(deviceId, false))}
              >
                Deactivate
              </Button>
            ) : (
              <Button size="sm" disabled={pending} onClick={() => run(() => setDeviceActive(deviceId, true))}>
                Activate
              </Button>
            )}
            <p className="mt-1.5 text-[11px] text-muted">
              A deactivated device&rsquo;s punches are rejected by the ingest endpoint.
            </p>
          </div>
        </div>
      </SlideOver>
    </>
  );
}
