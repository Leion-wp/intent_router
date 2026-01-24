import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import { PipelineFile, parsePipeline, compileStep, applyDefaultCwd, resolveTemplateVariables } from '../pipeline/compiler';
import { Intent } from '../types';

export async function runPipelineCLI(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const pipeline = parsePipeline(content);

    console.log(`Running pipeline: ${pipeline.name}`);
    console.log(`Steps: ${pipeline.steps.length}`);

    const variableStore = new Map<string, any>();
    let currentCwd = process.cwd();

    const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

    for (let i = 0; i < pipeline.steps.length; i++) {
        const step = pipeline.steps[i];

        // Handle system.setCwd
        if (step.intent === 'system.setCwd') {
             const rawPath = (step.payload as any)?.path;
             if (rawPath) {
                 const resolvedPath = resolveTemplateVariables(rawPath, variableStore);
                 if (path.isAbsolute(resolvedPath)) {
                     currentCwd = resolvedPath;
                 } else {
                     currentCwd = path.resolve(currentCwd, resolvedPath);
                 }
                 log(`Changed CWD to: ${currentCwd}`);
             }
             continue;
        }

        // Handle system.setVar
        if (step.intent === 'system.setVar') {
            const name = (step.payload as any)?.name;
            const value = (step.payload as any)?.value;
             if (name && value) {
                 const resolvedValue = resolveTemplateVariables(value, variableStore);
                 variableStore.set(name, resolvedValue);
                 log(`Set variable ${name} = ${resolvedValue}`);
             }
             continue;
        }

        const stepIntent: Intent = {
            ...step,
            payload: step.intent === 'terminal.run' ? applyDefaultCwd(step.payload, currentCwd) : step.payload
        };

        let compiledStep: Intent;
        try {
            compiledStep = await compileStep(stepIntent, variableStore, currentCwd);
        } catch (error) {
            log(`Compilation failed at step ${i + 1}: ${error}`);
            throw error;
        }

        log(`Step ${i + 1}: ${compiledStep.description || compiledStep.intent}`);

        if (compiledStep.intent === 'terminal.run') {
            const command = compiledStep.payload?.command;
            const cwd = compiledStep.payload?.cwd || currentCwd;

            if (!command) {
                log(`Error: terminal.run missing command`);
                throw new Error('terminal.run missing command');
            }

            log(`> ${command} (in ${cwd})`);

            await new Promise<void>((resolve, reject) => {
                const child = child_process.spawn(command, {
                    cwd,
                    shell: true,
                    stdio: 'inherit'
                });

                child.on('error', reject);
                child.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Command exited with code ${code}`));
                    }
                });
            });
        } else {
            log(`Warning: Skipping unsupported intent ${compiledStep.intent} in CLI mode.`);
        }
    }

    log(`Pipeline completed successfully.`);
}
