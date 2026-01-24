import { runPipelineCLI } from './runner';

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.error('Usage: intent-router <pipeline-file>');
        process.exit(1);
    }

    const filePath = args[0];
    try {
        await runPipelineCLI(filePath);
    } catch (error: any) {
        console.error('Pipeline failed:', error.message || error);
        process.exit(1);
    }
}

main();
