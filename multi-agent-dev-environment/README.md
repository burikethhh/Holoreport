# Multi-Agent Development Environment

Welcome to the Multi-Agent Development Environment project! This repository is designed to facilitate collaboration among different AI roles to streamline the development process. Below is an overview of the project structure, roles, and setup instructions.

## Project Structure

- **.github/**: Contains GitHub-specific files, including workflows and instructions for using GitHub Copilot.
- **agents/**: Contains documentation for each AI role involved in the project.
  - **full-stack-leader-claude-opus-4.6.md**: Responsibilities and capabilities of the Full Stack Leader.
  - **researcher-gemini-3.1-pro.md**: Description of the Researcher role and its functions.
  - **assistant-claude-sonnet-4.6.md**: Details on the Assistant role and how it supports other roles.
  - **gpt-5.2-codex-max.md**: Responsibilities and capabilities of the Code Architect.
  - **gpt-5.3-codex.md**: Description of the Code Specialist role and its functions.
  - **gpt-5.4.md**: Details on the Strategic AI Lead role and how it oversees the entire agent team.
- **prompts/**: Contains prompts and guidelines for various phases of the project.
  - **planning.md**: Guidelines for the planning phase.
  - **research.md**: Prompts for the research phase.
  - **implementation.md**: Assistance for the implementation phase.
- **src/**: Contains the source code for the project.
  - **orchestrator.ts**: Main orchestrator for managing interactions between roles.
  - **types/**: Contains type definitions used throughout the project.
    - **index.ts**: Exports types and interfaces.
- **package.json**: Configuration file for npm, listing dependencies and scripts.
- **tsconfig.json**: TypeScript configuration file specifying compiler options.
- **README.md**: This documentation file.

## Roles

1. **Full Stack Leader (Claude Opus 4.6)**: Manages the development process, ensuring that all components are integrated and functioning as intended. Generate the codes, research papers and everything.
2. **Researcher (Gemini 3.1 Pro)**: Gathers and analyzes information relevant to the project, providing insights and data to support decision-making. Can plan and search the web for the information, rrl's, images for a research paper making purposes.
3. **Assistant (Claude Sonnet 4.6)**: Supports the Full Stack Leader and Researcher by handling tasks and retrieving information as needed.
4. **Code Architect (GPT-5.2 Codex Max)**: Designs the overall system architecture, sets coding standards, solves complex algorithmic challenges, and enforces security-first development practices across the entire codebase.
5. **Code Specialist (GPT-5.3 Codex)**: Implements features, debugs issues, performs automated refactoring, and generates comprehensive tests — translating architectural blueprints into production-ready code at high velocity.
6. **Strategic AI Lead (GPT-5.4)**: Operates at the highest level of abstraction — defining project strategy, orchestrating cross-agent workflows, performing systemic quality assurance, and making intelligent decisions to keep the entire team aligned on goals.

## Setup Instructions

1. Clone the repository to your local machine.
2. Navigate to the project directory.
3. Install the necessary dependencies by running:
   ```
   npm install
   ```
4. Configure your development environment as needed.
5. Start the application by running:
   ```
   npm start
   ```

## Contribution

We welcome contributions to enhance the functionality and capabilities of this multi-agent development environment. Please refer to the contribution guidelines in the `.github` directory for more information.

## License

This project is licensed under the MIT License. See the LICENSE file for details.

Thank you for your interest in the Multi-Agent Development Environment!