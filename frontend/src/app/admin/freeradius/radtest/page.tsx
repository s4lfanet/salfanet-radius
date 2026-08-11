'use client';

import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
    Play, Loader2, CheckCircle, XCircle, Key, User, Server,
    Shield, RefreshCw, Terminal, Copy, Clock
} from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';

interface RadTestResult {
    success: boolean;
    responseCode: string;
    responseType: string;
    duration: number;
    attributes: { name: string; value: string }[];
    rawOutput: string;
}

export default function RadTestPage() {
    const { t } = useTranslation();
  const { addToast } = useToast();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [nasIP, setNasIP] = useState('127.0.0.1');
    const [nasPort, setNasPort] = useState('1812');
    const [secret, setSecret] = useState('testing123');
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<RadTestResult | null>(null);
    const [showRaw, setShowRaw] = useState(false);

    const handleTest = async () => {
        if (!username || !password) {
            addToast({ type: 'warning', title: t('radius.requiredFields'), description: 'Please enter username and password' });
            return;
        }

        setTesting(true);
        setResult(null);

        try {
            const response = await fetch('/api/freeradius/radtest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    password,
                    nasIP,
                    nasPort: parseInt(nasPort, 10),
                    secret
                })
            });

            const data = await response.json();

            if (response.ok) {
                setResult(data.result);
            } else {
                throw new Error(data.error || 'Test failed');
            }
        } catch (error: any) {
            addToast({ type: 'error', title: t('common.error'), description: error.message || 'Failed to run radtest' });
        } finally {
            setTesting(false);
        }
    };

    const copyRawOutput = () => {
        if (result?.rawOutput) {
            navigator.clipboard.writeText(result.rawOutput);
            addToast({ type: 'success', title: 'Copied!', duration: 1500 });
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                    <Shield className="w-6 h-6 text-primary" />
                    {t('radius.radTestTitle')}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    {t('radius.radTestSubtitle')}
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Test Form */}
                <div className="bg-card rounded-xl border border-border p-6">
                    <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                        <Key className="w-5 h-5 text-primary" />
                        {t('radius.authTest')}
                    </h2>

                    <div className="space-y-4">
                        {/* Username */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                <User className="w-4 h-4 inline mr-1" />
                                {t('radius.username')}
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Enter PPPoE username"
                                className="w-full px-4 py-2.5 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                <Key className="w-4 h-4 inline mr-1" />
                                {t('radius.password')}
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter password"
                                className="w-full px-4 py-2.5 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                            />
                        </div>

                        {/* NAS IP */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">
                                    <Server className="w-4 h-4 inline mr-1" />
                                    {t('radius.nasIp')}
                                </label>
                                <input
                                    type="text"
                                    value={nasIP}
                                    onChange={(e) => setNasIP(e.target.value)}
                                    placeholder="127.0.0.1"
                                    className="w-full px-4 py-2.5 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">
                                    {t('radius.port')}
                                </label>
                                <input
                                    type="text"
                                    value={nasPort}
                                    onChange={(e) => setNasPort(e.target.value)}
                                    placeholder="1812"
                                    className="w-full px-4 py-2.5 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                                />
                            </div>
                        </div>

                        {/* Secret */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                <Shield className="w-4 h-4 inline mr-1" />
                                {t('radius.sharedSecret')}
                            </label>
                            <input
                                type="password"
                                value={secret}
                                onChange={(e) => setSecret(e.target.value)}
                                placeholder="NAS shared secret"
                                className="w-full px-4 py-2.5 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                {t('radius.secretHint')}
                            </p>
                        </div>

                        {/* Test Button */}
                        <button
                            onClick={handleTest}
                            disabled={testing}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                            {testing ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    {t('radius.testing')}
                                </>
                            ) : (
                                <>
                                    <Play className="w-5 h-5" />
                                    {t('radius.runTest')}
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Results */}
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                    <div className="p-4 border-b border-border flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                            <Terminal className="w-5 h-5 text-primary" />
                            {t('radius.testResult')}
                        </h2>
                        {result && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowRaw(!showRaw)}
                                    className="text-xs text-primary hover:underline"
                                >
                                    {showRaw ? 'Show Parsed' : 'Show Raw'}
                                </button>
                                <button
                                    onClick={copyRawOutput}
                                    className="p-1.5 hover:bg-muted rounded transition-colors"
                                    title={t('radius.copy')}
                                >
                                    <Copy className="w-4 h-4 text-muted-foreground" />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="p-4 min-h-[300px]">
                        {!result ? (
                            <div className="flex flex-col items-center justify-center h-full text-center py-12">
                                <Shield className="w-12 h-12 text-muted-foreground/50 mb-3" />
                                <p className="text-sm text-muted-foreground">
                                    Run a test to see results here
                                </p>
                            </div>
                        ) : showRaw ? (
                            <pre className="text-xs font-mono text-foreground bg-muted/50 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
                                {result.rawOutput}
                            </pre>
                        ) : (
                            <div className="space-y-4">
                                {/* Status */}
                                <div className={`flex items-center gap-3 p-4 rounded-lg ${result.success ? 'bg-green-500/10' : 'bg-red-500/10'
                                    }`}>
                                    {result.success ? (
                                        <CheckCircle className="w-8 h-8 text-green-500" />
                                    ) : (
                                        <XCircle className="w-8 h-8 text-red-500" />
                                    )}
                                    <div>
                                        <p className={`font-bold ${result.success ? 'text-green-600' : 'text-red-600'}`}>
                                            {result.responseType}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            Response code: {result.responseCode}
                                        </p>
                                    </div>
                                </div>

                                {/* Duration */}
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Clock className="w-4 h-4" />
                                    Response time: {result.duration}ms
                                </div>

                                {/* Attributes */}
                                {result.attributes && result.attributes.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-medium text-foreground mb-2">
                                            {t('radius.replyAttributes')}
                                        </h3>
                                        <div className="space-y-1">
                                            {result.attributes.map((attr, idx) => (
                                                <div key={idx} className="flex justify-between text-xs py-1.5 px-3 bg-muted/50 rounded">
                                                    <span className="text-primary font-mono">{attr.name}</span>
                                                    <span className="text-foreground font-mono">{attr.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Command Help */}
            <div className="bg-card rounded-xl border border-border p-6">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-primary" />
                    {t('radius.manualCommand')}
                </h3>
                <code className="block text-xs font-mono bg-muted/50 p-3 rounded-lg text-muted-foreground overflow-x-auto">
                    radtest {username || '<username>'} {password ? '****' : '<password>'} {nasIP}:{nasPort} 0 {secret || '<secret>'}
                </code>
            </div>
        </div>
    );
}
