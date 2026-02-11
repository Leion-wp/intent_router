import { useEffect, useState } from 'react';
import { isInboundMessage, WebviewOutboundMessage } from '../types/messages';

export type SidebarEnvVar = {
  key: string;
  value: string;
  visible: boolean;
};

type UseSidebarEnvironmentStateResult = {
  envVars: SidebarEnvVar[];
  updateEnvVar: (index: number, field: 'key' | 'value', value: string) => void;
  toggleVisibility: (index: number) => void;
  removeEnvVar: (index: number) => void;
  handleBlur: () => void;
  addEnvVar: () => void;
};

function mapEnvironmentToVars(environment: Record<string, string> | undefined): SidebarEnvVar[] {
  if (!environment) return [];
  return Object.entries(environment).map(([key, value]) => ({
    key,
    value: String(value),
    visible: false
  }));
}

export function useSidebarEnvironmentState(): UseSidebarEnvironmentStateResult {
  const [envVars, setEnvVars] = useState<SidebarEnvVar[]>(() => mapEnvironmentToVars(window.initialData?.environment));

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isInboundMessage(event.data)) return;
      if (event.data.type !== 'environmentUpdate') return;
      setEnvVars(mapEnvironmentToVars(event.data.environment));
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const saveEnv = (nextVars: SidebarEnvVar[]) => {
    setEnvVars(nextVars);
    const environment = nextVars.reduce((acc, curr) => {
      if (curr.key) acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    if (window.vscode) {
      const message: WebviewOutboundMessage = {
        type: 'saveEnvironment',
        environment
      };
      window.vscode.postMessage(message);
    }
  };

  const addEnvVar = () => {
    const next = [...envVars, { key: '', value: '', visible: true }];
    setEnvVars(next);
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    const next = [...envVars];
    next[index] = { ...next[index], [field]: value };
    setEnvVars(next);
  };

  const toggleVisibility = (index: number) => {
    const next = [...envVars];
    next[index] = { ...next[index], visible: !next[index].visible };
    setEnvVars(next);
  };

  const removeEnvVar = (index: number) => {
    const next = envVars.filter((_, itemIndex) => itemIndex !== index);
    saveEnv(next);
  };

  const handleBlur = () => {
    saveEnv(envVars);
  };

  return {
    envVars,
    updateEnvVar,
    toggleVisibility,
    removeEnvVar,
    handleBlur,
    addEnvVar
  };
}
