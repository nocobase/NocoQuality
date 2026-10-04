import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useRef, useState } from 'react';

// Posts one mutation at a time and keeps a translated error for the form that called it. `codes` maps a
// server error code to a more specific message key than the generic conflict or save error.
export function useSubmission() {
  const api = useApiClient();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lockRef = useRef(false);
  async function submit<T>(
    path: string,
    json: unknown,
    done: (data: T) => void,
    codes: Record<string, string> = {},
  ) {
    if (lockRef.current) return;
    lockRef.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api.request<{ data: T }>({
        path,
        method: 'POST',
        json,
      });
      done(result.data);
    } catch (e) {
      const code =
        e instanceof ApiClientError
          ? (e.code ??
            (e.payload as { error?: { code?: string } } | undefined)?.error
              ?.code)
          : undefined;
      setError(
        t(
          code && codes[code]
            ? codes[code]
            : e instanceof ApiClientError && e.status === 409
              ? 'qc.conflict'
              : e instanceof ApiClientError && e.status === 403
                ? 'qc.forbidden'
                : 'qc.saveError',
        ),
      );
    } finally {
      lockRef.current = false;
      setBusy(false);
    }
  }
  return { submit, busy, error };
}
