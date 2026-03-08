import { FullStackLeader } from '../agents/full-stack-leader-claude-opus-4.6';
import { Researcher } from '../agents/researcher-gemini-3.1-pro';
import { Assistant } from '../agents/assistant-claude-sonnet-4.6';
import { CodeArchitect } from '../agents/gpt-5.2-codex-max';
import { CodeSpecialist } from '../agents/gpt-5.3-codex';
import { StrategicAILead } from '../agents/gpt-5.4';

class Orchestrator {
    private fullStackLeader: FullStackLeader;
    private researcher: Researcher;
    private assistant: Assistant;
    private codeArchitect: CodeArchitect;
    private codeSpecialist: CodeSpecialist;
    private strategicLead: StrategicAILead;

    constructor() {
        this.fullStackLeader = new FullStackLeader();
        this.researcher = new Researcher();
        this.assistant = new Assistant();
        this.codeArchitect = new CodeArchitect();
        this.codeSpecialist = new CodeSpecialist();
        this.strategicLead = new StrategicAILead();
    }

    public async coordinateTasks() {
        // Strategic lead sets the roadmap and priorities
        const strategy = await this.strategicLead.defineStrategy();

        // Researcher gathers information to inform decisions
        const researchData = await this.researcher.conductResearch();

        // Full stack leader plans development based on strategy and research
        const planningData = this.fullStackLeader.planDevelopment(researchData);

        // Code architect designs the system architecture
        const architecture = await this.codeArchitect.designArchitecture(planningData);

        // Code specialist implements features based on the architecture
        const implementation = await this.codeSpecialist.implementFeatures(architecture);

        // Assistant handles supporting tasks and coordination
        await this.assistant.executeTasks(implementation);

        // Strategic lead reviews and validates the final output
        await this.strategicLead.reviewOutput(implementation, strategy);
    }
}

const orchestrator = new Orchestrator();
orchestrator.coordinateTasks();