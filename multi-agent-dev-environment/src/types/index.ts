export interface Agent {
    id: string;
    name: string;
    role: string;
    capabilities: string[];
}

export interface Task {
    id: string;
    description: string;
    assignedTo: string;
    status: 'pending' | 'in-progress' | 'completed';
}

export interface Communication {
    from: string;
    to: string;
    message: string;
    timestamp: Date;
}

export interface Project {
    id: string;
    name: string;
    agents: Agent[];
    tasks: Task[];
    communications: Communication[];
}