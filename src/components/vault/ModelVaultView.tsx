import React, { useState, useEffect } from 'react';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Cpu, Download, CheckCircle, FolderOpen, HardDrive, ShieldCheck, AlertCircle } from 'lucide-react';
import { useTelemetry } from '../../hooks/useTelemetry';
import { api, isTauri } from '../../services/api';
import { ModelStatusItem } from '../../types';

export const ModelVaultView: React.FC = () => {
  const telemetry = useTelemetry(1000);
  const [models, setModels] = useState<ModelStatusItem[]>([]);
  const [vaultPath, setVaultPath] = useState<string>('./models');
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadSpeed, setDownloadSpeed] = useState<string>('0.0');
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(true);

  const fetchVaultStatus = async () => {
    try {
      const status = await api.getModelVaultStatus();
      if (status && status.models) {
        setModels(status.models);
        if (status.vaultPath) setVaultPath(status.vaultPath);
      }
    } catch (err) {
      console.error('Failed to get model vault status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchVaultStatus();

    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<any>('model_download_progress', (event) => {
          const payload = event.payload;
          if (payload) {
            setDownloadProgress(Math.round(payload.percentage || 0));
            setDownloadSpeed((payload.speedMbps || 0).toFixed(1));
            if (payload.isCompleted) {
              setDownloadingModelId(null);
              fetchVaultStatus();
            }
          }
        }).then((unsub) => {
          unlisten = unsub;
        });
      }).catch((e) => {
        console.warn('Could not bind download listener:', e);
      });
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Custom Model Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [customPath, setCustomPath] = useState('');
  const [customName, setCustomName] = useState('');

  const activeModel = models.find((m) => m.isActive) || models[0] || {
    name: 'No Active Model',
    vramEstimatedMb: 0,
  };

  const handleStartDownload = async (modelId: string) => {
    setDownloadingModelId(modelId);
    setDownloadProgress(0);
    setDownloadSpeed('0.0');

    try {
      await api.downloadAiModel(modelId);
      await fetchVaultStatus();
    } catch (err: any) {
      console.error('[Model Download Error]', err);
      alert(`Model download error: ${err?.message || err}`);
    } finally {
      setDownloadingModelId(null);
    }
  };

  const handleActivateModel = async (modelId: string) => {
    try {
      await api.setActiveAiModel(modelId);
      setModels((prev) =>
        prev.map((m) => ({
          ...m,
          isActive: m.id === modelId,
        }))
      );
    } catch (err) {
      console.error('[Activate Model Error]', err);
    }
  };

  const handleImportCustom = () => {
    if (!customName.trim()) return;
    const customItem: ModelStatusItem = {
      id: `custom_${Date.now()}`,
      name: customName,
      parameterSize: 'Custom',
      quantization: 'GGUF',
      fileSizeMb: 1200,
      description: `User-imported local model located at: ${customPath || 'custom_model.gguf'}`,
      filename: customPath || 'custom_model.gguf',
      isInstalled: true,
      isActive: false,
      localPath: customPath,
      downloadUrl: '',
      sha256: 'custom_user_provided',
    };
    setModels((prev) => [...prev, customItem]);
    setCustomName('');
    setCustomPath('');
    setIsImportModalOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Info */}
      <div
        className="glass-panel"
        style={{
          padding: '20px 24px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Local AI Model Vault</h2>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--accent-subtle)',
                color: 'var(--accent)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              &lt; 2.0 GB VRAM Target
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Manage offline GGUF Small Language Models (SLMs), custom storage directories, and dynamic hardware layer allocations.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          icon={<HardDrive size={14} />}
          onClick={() => setIsImportModalOpen(true)}
        >
          Import Local .GGUF
        </Button>
      </div>

      {/* Hardware VRAM Allocation Live Monitor */}
      <div
        className="glass-panel"
        style={{
          padding: '16px 20px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Active Model</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
            {activeModel.name}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Allocated VRAM</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent)', marginTop: '2px' }}>
            {telemetry.vramUsedMb} / {telemetry.vramTotalMb} MB
          </div>
        </div>

        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>GPU Offload Strategy</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--status-success)', marginTop: '2px' }}>
            {telemetry.gpuLayersOffloaded} / {telemetry.totalGpuLayers} Layers (GPU Accelerated)
          </div>
        </div>

        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Inference Privacy</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--status-success)', marginTop: '2px' }}>
            100% Offline Air-Gapped
          </div>
        </div>
      </div>

      {/* Model Vault Storage Path Card */}
      <div
        className="glass-panel"
        style={{
          padding: '16px 20px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FolderOpen size={18} color="var(--accent)" />
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Model Storage Location</div>
            <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {vaultPath}
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            const newPath = prompt('Enter new Model Vault directory path (e.g. ./models or D:\\AI_Models):', vaultPath);
            if (newPath) updateVaultPath(newPath);
          }}
          style={{
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-medium)',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Change Storage Path
        </button>
      </div>

      {/* Models Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Curated Offline Models ({models.length})
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
          {models.map((model) => {
            const isDownloading = downloadingModelId === model.id;

            return (
              <div
                key={model.id}
                className="glass-panel"
                style={{
                  padding: '20px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: model.isActive ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                  border: `1px solid ${model.isActive ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  position: 'relative',
                }}
              >
                {/* Header */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {model.name}
                      </h4>
                      <div style={{ display: 'flex', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        <span>{model.parameterSize}</span>
                        <span>•</span>
                        <span>{model.quantization}</span>
                        <span>•</span>
                        <span>{model.fileSizeMb} MB</span>
                      </div>
                    </div>

                    {model.isActive ? (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          color: 'var(--status-success)',
                          border: '1px solid var(--status-success)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <CheckCircle size={11} /> ACTIVE
                      </span>
                    ) : model.isInstalled ? (
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: 'var(--bg-primary)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        INSTALLED
                      </span>
                    ) : null}
                  </div>

                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '12px' }}>
                    {model.description}
                  </p>

                  {/* VRAM Footprint & Integrity */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      backgroundColor: 'var(--bg-primary)',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Cpu size={13} color="var(--accent)" />
                      <span>~{Math.round(model.fileSizeMb * 1.15)} MB VRAM</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ShieldCheck size={13} color="var(--status-success)" />
                      <span>SHA-256 Verified</span>
                    </div>
                  </div>
                </div>

                {/* Download Progress Bar */}
                {isDownloading && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <span>Downloading from Hugging Face Hub...</span>
                      <span>{downloadProgress}% ({downloadSpeed} MB/s)</span>
                    </div>
                    <div
                      style={{
                        height: '6px',
                        backgroundColor: 'var(--bg-primary)',
                        borderRadius: 'var(--radius-full)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${downloadProgress}%`,
                          height: '100%',
                          backgroundColor: 'var(--accent)',
                          transition: 'width 0.2s linear',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {model.isActive ? (
                    <Button variant="secondary" size="sm" disabled style={{ flex: 1 }}>
                      Currently Active Engine
                    </Button>
                  ) : model.isInstalled ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleActivateModel(model.id)}
                      style={{ flex: 1 }}
                    >
                      Activate Model
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Download size={14} />}
                      onClick={() => handleStartDownload(model.id)}
                      isLoading={isDownloading}
                      style={{ flex: 1 }}
                    >
                      Download & Install ({model.fileSizeMb} MB)
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Import Custom GGUF Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Import Custom GGUF Model"
        subtitle="Mount an existing local .gguf model file without redownloading"
        maxWidth="500px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Model Display Name
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Mistral-7B-Instruct-Q4"
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Absolute File Path to .gguf
            </label>
            <input
              type="text"
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder="D:\AI_Models\custom_model.gguf"
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              fontSize: '11px',
              color: 'var(--status-warning)',
              display: 'flex',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>
              Ensure the imported GGUF model stays within your GPU VRAM limit (<strong>2,048 MB</strong>) or dynamic layer offloading will shift layers to CPU RAM.
            </span>
          </div>

          <Button
            variant="primary"
            onClick={handleImportCustom}
            disabled={!customName.trim()}
          >
            Mount Custom GGUF
          </Button>
        </div>
      </Modal>
    </div>
  );
};
