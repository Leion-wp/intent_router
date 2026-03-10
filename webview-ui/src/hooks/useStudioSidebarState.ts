import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { SchemaField } from '../components/SchemaArgsForm';
import { isInboundMessage, WebviewOutboundMessage } from '../types/messages';
import { formatUiError, formatUiInfo } from '../utils/uiMessageUtils';

type CustomNodeDefinition = {
  id: string;
  title: string;
  intent: string;
  schema: SchemaField[];
  mapping: Record<string, unknown>;
};

type StudioDraft = {
  id: string;
  title: string;
  intent: string;
  schema: SchemaField[];
  mapping: Record<string, unknown>;
};

type UseStudioSidebarStateResult = {
  customNodes: CustomNodeDefinition[];
  setCustomNodes: Dispatch<SetStateAction<CustomNodeDefinition[]>>;
  studioSelectedId: string;
  studioDraft: StudioDraft | null;
  setStudioDraft: Dispatch<SetStateAction<StudioDraft | null>>;
  studioMappingJson: string;
  setStudioMappingJson: Dispatch<SetStateAction<string>>;
  studioPreviewValues: Record<string, unknown>;
  setStudioPreviewValues: Dispatch<SetStateAction<Record<string, unknown>>>;
  studioError: string;
  studioExportJson: string;
  studioImportJson: string;
  setStudioImportJson: Dispatch<SetStateAction<string>>;
  studioImportSummary: string;
  allCapabilities: string[];
  startNewDraft: () => void;
  selectDraft: (id: string) => void;
  saveDraft: () => void;
  deleteDraft: (id: string) => void;
  exportSelectedOrAll: (scope: 'one' | 'all') => void;
  importFromPaste: () => void;
  importFromFile: () => void;
  retryLastAction: () => void;
  clearFeedback: () => void;
  canRetryLastAction: boolean;
};

function toCustomNodeDefinition(input: any): CustomNodeDefinition {
  return {
    id: String(input?.id || ''),
    title: String(input?.title || ''),
    intent: String(input?.intent || ''),
    schema: Array.isArray(input?.schema) ? (input.schema as SchemaField[]) : [],
    mapping: input?.mapping && typeof input.mapping === 'object' ? (input.mapping as Record<string, unknown>) : {}
  };
}

export function useStudioSidebarState(): UseStudioSidebarStateResult {
  const [customNodes, setCustomNodes] = useState<CustomNodeDefinition[]>(() => {
    const initial = Array.isArray(window.initialData?.customNodes) ? window.initialData.customNodes : [];
    return initial.map((entry: any) => toCustomNodeDefinition(entry));
  });
  const [studioSelectedId, setStudioSelectedId] = useState<string>('');
  const [studioDraft, setStudioDraft] = useState<StudioDraft | null>(null);
  const [studioMappingJson, setStudioMappingJson] = useState<string>('{}');
  const [studioPreviewValues, setStudioPreviewValues] = useState<Record<string, unknown>>({});
  const [studioError, setStudioError] = useState<string>('');
  const [studioExportJson, setStudioExportJson] = useState<string>('');
  const [studioImportJson, setStudioImportJson] = useState<string>('');
  const [studioImportSummary, setStudioImportSummary] = useState<string>('');
  const [lastFailedAction, setLastFailedAction] = useState<'save' | 'importPaste' | 'importFile' | null>(null);
  const lastImportSourceRef = useRef<'paste' | 'file' | null>(null);

  const allCapabilities = useMemo(() => {
    const groups = (window.initialData?.commandGroups as any[]) || [];
    const out: string[] = [];
    for (const group of groups) {
      for (const command of (group?.commands || [])) {
        const capability = String(command?.capability || '').trim();
        if (capability) out.push(capability);
      }
    }
    out.sort();
    return out;
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isInboundMessage(event.data)) return;
      if (event.data.type === 'customNodesUpdate') {
        const nodes = Array.isArray((event.data as any).nodes) ? (event.data as any).nodes : [];
        setCustomNodes(nodes.map((entry: any) => toCustomNodeDefinition(entry)));
      }
      if (event.data.type === 'customNodesExported') {
        setStudioExportJson(String((event.data as any).json || ''));
      }
      if (event.data.type === 'customNodesImported') {
        const renames = (event.data as any).renames || {};
        const renamedCount = Object.keys(renames).length;
        const importedCount = ((event.data as any).imported || []).length;
        setLastFailedAction(null);
        setStudioImportSummary(
          formatUiInfo(
            `Imported ${importedCount} node(s).` + (renamedCount ? ` Renamed ${renamedCount} due to ID conflicts.` : ''),
            { context: 'Node Studio', action: 'Review imported nodes before publishing.' }
          )
        );
      }
      if (event.data.type === 'customNodesImportError') {
        setLastFailedAction(lastImportSourceRef.current === 'file' ? 'importFile' : 'importPaste');
        setStudioImportSummary(formatUiError((event.data as any).message, {
          context: 'Node Studio import',
          action: 'Fix JSON payload and retry.'
        }));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const startNewDraft = () => {
    const draft: StudioDraft = { id: '', title: '', intent: '', schema: [], mapping: {} };
    setStudioDraft(draft);
    setStudioSelectedId('');
    setStudioMappingJson('{}');
    setStudioPreviewValues({});
    setStudioExportJson('');
    setStudioImportJson('');
    setStudioImportSummary('');
    setStudioError('');
  };

  const selectDraft = (id: string) => {
    const found = customNodes.find((node) => node.id === id);
    if (!found) return;
    setStudioSelectedId(id);
    setStudioDraft({
      id: found.id,
      title: found.title,
      intent: found.intent,
      schema: Array.isArray(found.schema) ? found.schema : [],
      mapping: found.mapping && typeof found.mapping === 'object' ? found.mapping : {}
    });
    setStudioMappingJson(JSON.stringify(found.mapping && typeof found.mapping === 'object' ? found.mapping : {}, null, 2));
    setStudioPreviewValues({});
    setStudioExportJson('');
    setStudioImportJson('');
    setStudioImportSummary('');
    setStudioError('');
  };

  const saveDraft = () => {
    if (!studioDraft) return;
    const id = String(studioDraft.id || '').trim();
    const title = String(studioDraft.title || '').trim();
    const intent = String(studioDraft.intent || '').trim();
    if (!id || !title || !intent) {
      setLastFailedAction('save');
      setStudioError(formatUiError('id, title, intent are required.', {
        context: 'Node Studio validation',
        action: 'Fill all required fields.'
      }));
      return;
    }

    let mapping: Record<string, unknown> = {};
    try {
      mapping = studioMappingJson.trim() ? JSON.parse(studioMappingJson) : {};
    } catch (error: any) {
      setLastFailedAction('save');
      setStudioError(formatUiError(`Invalid mapping JSON: ${error?.message || error}`, {
        context: 'Node Studio validation',
        action: 'Provide valid JSON for mapping.'
      }));
      return;
    }

    const node: CustomNodeDefinition = {
      id,
      title,
      intent,
      schema: Array.isArray(studioDraft.schema) ? studioDraft.schema : [],
      mapping: mapping && typeof mapping === 'object' ? mapping : {}
    };

    setStudioError('');
    setLastFailedAction(null);
    if (window.vscode) {
      const message: WebviewOutboundMessage = { type: 'customNodes.upsert', node };
      window.vscode.postMessage(message);
    }
    setStudioSelectedId(id);
  };

  const deleteDraft = (id: string) => {
    const target = String(id || '').trim();
    if (!target) return;
    if (window.vscode) {
      const message: WebviewOutboundMessage = { type: 'customNodes.delete', id: target };
      window.vscode.postMessage(message);
    }
    if (studioSelectedId === target) {
      setStudioSelectedId('');
      setStudioDraft(null);
      setStudioMappingJson('{}');
      setStudioPreviewValues({});
      setStudioError('');
    }
  };

  const exportSelectedOrAll = (scope: 'one' | 'all') => {
    if (!window.vscode) return;
    const id = scope === 'one' ? String(studioSelectedId || '') : undefined;
    const message: WebviewOutboundMessage = { type: 'customNodes.export', scope, id };
    window.vscode.postMessage(message);
  };

  const importFromPaste = () => {
    if (!window.vscode) return;
    lastImportSourceRef.current = 'paste';
    setLastFailedAction(null);
    const message: WebviewOutboundMessage = { type: 'customNodes.import', source: 'paste', jsonText: studioImportJson };
    window.vscode.postMessage(message);
  };

  const importFromFile = () => {
    if (!window.vscode) return;
    lastImportSourceRef.current = 'file';
    setLastFailedAction(null);
    const message: WebviewOutboundMessage = { type: 'customNodes.import', source: 'file' };
    window.vscode.postMessage(message);
  };

  const retryLastAction = () => {
    if (lastFailedAction === 'save') {
      saveDraft();
      return;
    }
    if (lastFailedAction === 'importPaste') {
      importFromPaste();
      return;
    }
    if (lastFailedAction === 'importFile') {
      importFromFile();
    }
  };

  const clearFeedback = () => {
    setStudioError('');
    setStudioImportSummary('');
    setLastFailedAction(null);
  };

  return {
    customNodes,
    setCustomNodes,
    studioSelectedId,
    studioDraft,
    setStudioDraft,
    studioMappingJson,
    setStudioMappingJson,
    studioPreviewValues,
    setStudioPreviewValues,
    studioError,
    studioExportJson,
    studioImportJson,
    setStudioImportJson,
    studioImportSummary,
    allCapabilities,
    startNewDraft,
    selectDraft,
    saveDraft,
    deleteDraft,
    exportSelectedOrAll,
    importFromPaste,
    importFromFile,
    retryLastAction,
    clearFeedback,
    canRetryLastAction: lastFailedAction !== null
  };
}
