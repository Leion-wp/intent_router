export type FlowSocketType = 'flow' | 'text' | 'path' | 'json' | 'bool';

export function mapSchemaToSocketType(schemaType: string): FlowSocketType {
  const normalized = String(schemaType || 'string').toLowerCase();
  if (normalized === 'boolean' || normalized === 'checkbox') return 'bool';
  if (normalized === 'path') return 'path';
  if (normalized === 'json' || normalized === 'object') return 'json';
  return 'text';
}

type ResolverOptions = {
  commandGroups: any[];
  customNodesById: Map<string, any>;
};

export function createSocketTypeResolver(options: ResolverOptions) {
  const commandGroups = Array.isArray(options.commandGroups) ? options.commandGroups : [];
  const customNodesById = options.customNodesById;

  const getActionArgType = (node: any, argName: string): FlowSocketType => {
    const provider = String(node?.data?.provider || '').trim();
    const capability = String(node?.data?.capability || '').trim();
    const group = commandGroups.find((entry: any) => String(entry?.provider || '').trim() === provider);
    const commands = Array.isArray(group?.commands) ? group.commands : [];
    const cap = commands.find((entry: any) => {
      const id = String(entry?.capability || '').trim();
      return id === capability || id.endsWith(`.${capability}`);
    });
    const args = Array.isArray(cap?.args) ? cap.args : [];
    const arg = args.find((entry: any) => String(entry?.name || '').trim() === argName);
    return mapSchemaToSocketType(String(arg?.type || 'string'));
  };

  const getCustomArgType = (node: any, argName: string): FlowSocketType => {
    const customNodeId = String(node?.data?.customNodeId || '').trim();
    const customDef = customNodeId ? customNodesById.get(customNodeId) : undefined;
    const schema = Array.isArray(customDef?.schema) ? customDef.schema : (Array.isArray(node?.data?.schema) ? node.data.schema : []);
    const arg = schema.find((entry: any) => String(entry?.name || '').trim() === argName);
    return mapSchemaToSocketType(String(arg?.type || 'string'));
  };

  const getFormArgType = (node: any, argName: string): FlowSocketType => {
    const fields = Array.isArray(node?.data?.fields) ? node.data.fields : [];
    const field = fields.find((entry: any) => String(entry?.key || entry?.label || '').trim() === argName);
    const fieldType = String(field?.type || 'text').toLowerCase();
    if (fieldType === 'checkbox') return 'bool';
    return 'text';
  };

  const getSourceSocketType = (node: any, handleId: string): FlowSocketType => {
    if (!node) return 'flow';
    const hid = String(handleId || 'success');
    if (hid === 'success' || hid === 'failure' || hid === 'default' || hid.startsWith('route_')) return 'flow';
    if (hid === 'out_value') return 'text';
    if (hid === 'out_path') return 'path';
    if (hid === 'out_values') return 'json';
    return 'flow';
  };

  const getTargetSocketType = (node: any, handleId: string): FlowSocketType => {
    if (!node) return 'flow';
    const hid = String(handleId || 'in');
    if (hid === 'in') return 'flow';
    if (!hid.startsWith('in_')) return 'flow';
    const field = hid.slice(3);

    if (node.type === 'actionNode') return getActionArgType(node, field);
    if (node.type === 'customNode') return getCustomArgType(node, field);
    if (node.type === 'formNode') return getFormArgType(node, field);
    if (node.type === 'promptNode') return 'text';
    if (node.type === 'repoNode') return 'path';
    if (node.type === 'scriptNode') {
      if (field === 'scriptPath' || field === 'cwd') return 'path';
      return 'text';
    }
    if (node.type === 'vscodeCommandNode') {
      if (field === 'argsJson') return 'json';
      return 'text';
    }
    return 'text';
  };

  const areSocketTypesCompatible = (sourceType: FlowSocketType, targetType: FlowSocketType): boolean => {
    if (sourceType === targetType) return true;
    if (targetType === 'text' && (sourceType === 'path' || sourceType === 'json' || sourceType === 'bool')) return true;
    return false;
  };

  return {
    getSourceSocketType,
    getTargetSocketType,
    areSocketTypesCompatible
  };
}
