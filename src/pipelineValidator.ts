import { Intent } from './types';

export type PipelineValidationError = {
    stepId?: string;
    stepIntent: string;
    field: string;
    message: string;
};

type FieldSchema = {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required?: boolean;
    description?: string;
};

function getJsType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

export function validateStepInput(step: Intent, payload: Record<string, unknown>): PipelineValidationError[] {
    const schema = step.inputSchema;
    if (!schema || typeof schema !== 'object') return [];

    const errors: PipelineValidationError[] = [];

    for (const [field, def] of Object.entries(schema as Record<string, FieldSchema>)) {
        const value = payload[field];
        const missing = value === undefined || value === null || value === '';

        if (def.required && missing) {
            errors.push({
                stepId: step.id,
                stepIntent: step.intent,
                field,
                message: `Required field "${field}" is missing or empty.`
            });
            continue;
        }

        if (!missing) {
            const actualType = getJsType(value);
            const expectedType = def.type;
            const typeOk =
                actualType === expectedType ||
                (expectedType === 'number' && actualType === 'number') ||
                (expectedType === 'string' && actualType === 'string') ||
                (expectedType === 'boolean' && actualType === 'boolean') ||
                (expectedType === 'object' && actualType === 'object') ||
                (expectedType === 'array' && Array.isArray(value));
            if (!typeOk) {
                errors.push({
                    stepId: step.id,
                    stepIntent: step.intent,
                    field,
                    message: `Field "${field}" expected type "${expectedType}" but got "${actualType}".`
                });
            }
        }
    }

    return errors;
}

export function formatValidationErrors(errors: PipelineValidationError[]): string {
    return errors.map(e => `  • ${e.message}`).join('\n');
}
