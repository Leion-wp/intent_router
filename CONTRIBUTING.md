# Contributing to Intent Router

Thank you for your interest in contributing to Intent Router! We welcome contributions from the community to help make this VS Code extension even better.

## Getting Started

### Prerequisites

*   **Node.js**: Ensure you have Node.js installed.
*   **VS Code**: You'll need Visual Studio Code to develop and test the extension.

### Installation

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone https://github.com/YOUR_USERNAME/intent-router.git
    cd intent-router
    ```
3.  **Install dependencies**:
    ```bash
    npm install
    ```
    *Note: We strictly use `npm`. Please do not use `yarn` or `pnpm`.*

## Development Workflow

The project consists of two main parts:
1.  **The Extension Host** (src/): The backend logic running in VS Code.
2.  **The Webview UI** (webview-ui/): The React-based visual editor.

### Building the Project

*   **Build the Webview**:
    ```bash
    npm run build:webview
    ```
    This compiles the React app into `out/webview-bundle/`.

*   **Compile the Extension**:
    ```bash
    npm run compile
    ```

### Running the Extension

1.  Open the project in VS Code.
2.  Press `F5` to start debugging. This will open a new "Extension Development Host" window with the extension loaded.

### Working on the UI (Fast Refresh)

For faster UI development without restarting the extension host:
1.  Navigate to the webview directory:
    ```bash
    cd webview-ui
    ```
2.  Start the Vite dev server:
    ```bash
    npm run dev
    ```
    *Note: This runs the UI in a browser. Some VS Code specific APIs will be mocked.*

## Submitting a Pull Request

1.  **Create a new branch** for your feature or bug fix:
    ```bash
    git checkout -b feature/my-new-feature
    ```
2.  **Make your changes**. Ensure you follow the existing coding style.
3.  **Verify your changes**. Run tests if applicable.
4.  **Commit your changes**. Use descriptive commit messages.
5.  **Push to your fork**:
    ```bash
    git push origin feature/my-new-feature
    ```
6.  **Open a Pull Request** against the `main` branch of the original repository.

## Coding Guidelines

*   **TypeScript**: We use TypeScript for type safety. Please avoid `any` whenever possible.
*   **Linting**: Ensure your code passes standard linting checks.
*   **Clean Code**: Write readable, maintainable code.

## License

By contributing, you agree that your contributions will be licensed under its Apache License 2.0.
