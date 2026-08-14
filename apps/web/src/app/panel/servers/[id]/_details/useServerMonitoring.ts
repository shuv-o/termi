'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CheckInterval, HealthRecord, MonitorConfig, MonitorFormValues } from './types';

const HISTORY_LIMIT = 50;

/** Monitor configuration plus the recent health-check history for one server. */
export function useServerMonitoring(id: string) {
    const [monitorConfig, setMonitorConfig] = useState<MonitorConfig | null>(null);
    const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([]);
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const [form, setForm] = useState<MonitorFormValues>({
        enabled: false,
        checkIntervalMinutes: 5,
        alertEmail: true,
        alertPush: true,
        webhookEnabled: false,
        webhookPlatform: 'SLACK',
        webhookUrl: '',
        failureThreshold: 3,
    });

    // Monitor config and health history load alongside the cached server record.
    const loadAll = useCallback(async () => {
        try {
            const [monitorRes, historyRes] = await Promise.all([
                fetch(`/api/servers/${id}/monitor`),
                fetch(`/api/servers/${id}/health-history?limit=${HISTORY_LIMIT}`),
            ]);

            const [monitorData, historyData] = await Promise.all([
                monitorRes.json(),
                historyRes.json(),
            ]);

            if (monitorData.success && monitorData.data.config) {
                const cfg = monitorData.data.config as MonitorConfig;
                setMonitorConfig(cfg);
                setForm({
                    enabled: cfg.enabled,
                    checkIntervalMinutes: cfg.checkIntervalMinutes as CheckInterval,
                    alertEmail: cfg.alertEmail,
                    alertPush: cfg.alertPush,
                    webhookEnabled: cfg.webhookEnabled,
                    webhookPlatform: cfg.webhookPlatform ?? 'SLACK',
                    // Never prefilled — the server never sends the stored URL back.
                    webhookUrl: '',
                    failureThreshold: cfg.failureThreshold,
                });
            }

            if (historyData.success) {
                setHealthRecords(historyData.data.records);
            }
        } catch {
            /* monitoring data is supplementary — the page still works without it */
        }
    }, [id]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const refreshHistory = useCallback(async () => {
        setRefreshing(true);
        try {
            const res = await fetch(`/api/servers/${id}/health-history?limit=${HISTORY_LIMIT}`);
            const data = await res.json();
            if (data.success) setHealthRecords(data.data.records);
        } finally {
            setRefreshing(false);
        }
    }, [id]);

    const save = useCallback(async () => {
        setSaving(true);
        try {
            // A blank webhookUrl means "leave it as-is" — omit it entirely so
            // the API doesn't overwrite an already-stored URL with nothing.
            const { webhookUrl, ...rest } = form;
            const body = { ...rest, ...(webhookUrl.trim() && { webhookUrl: webhookUrl.trim() }) };

            const res = await fetch(`/api/servers/${id}/monitor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.success) {
                setMonitorConfig(data.data.config);
                setForm((f) => ({ ...f, webhookUrl: '' }));
            }
        } finally {
            setSaving(false);
        }
    }, [id, form]);

    //  Derived history figures
    const lastRecord = healthRecords[healthRecords.length - 1];
    const upCount = healthRecords.filter((r) => r.reachable).length;
    const uptimePct =
        healthRecords.length > 0 ? Math.round((upCount / healthRecords.length) * 100) : null;

    return {
        monitorConfig,
        healthRecords,
        form,
        setForm,
        saving,
        save,
        refreshing,
        refreshHistory,
        lastRecord,
        upCount,
        uptimePct,
    };
}
