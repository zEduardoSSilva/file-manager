# **App Name**: vFleet Pilot

## Core Features:

- Pipeline Management: List available data processing pipelines, allow users to select one for execution.
- Excel Input Uploader: Provide a user interface for uploading one or multiple Excel files as input for the selected pipeline.
- Pipeline Execution Engine: A backend service that securely triggers the execution of the selected Python pipeline with the uploaded Excel files.
- AI Parameter Assistant Tool: An AI tool that allows users to adjust dynamic pipeline parameters (e.g., month, year, specific filters) using natural language prompts, simplifying configuration.
- Execution Status Monitor: Display real-time progress, output logs, and status updates of the running pipeline, indicating success or detailed error messages.
- Firebase Data Storage: Automatically save the final transformed data from the Python pipeline directly to a Firebase database, overwriting previously stored data for the same pipeline run.
- Transformed Data Viewer: Enable users to browse and view the most recent dataset generated and saved by a specific pipeline directly from Firebase.

## Style Guidelines:

- Primary color: A deep, professional purple-blue (#5959CC) to signify precision and depth of data analysis, providing a strong, confident brand identity.
- Background color: A very light, almost white background with a subtle hint of purple-blue (#F4F4FB), promoting clarity and minimizing visual fatigue for detailed data review.
- Accent color: A bright, clear sky blue (#4DB8F7) to highlight calls to action, important notifications, and active states, creating visual energy and drawing attention.
- Body and headline font: 'Inter' (sans-serif) for all text elements, providing excellent legibility across various screen sizes and a modern, objective feel suitable for data applications.
- Code font: 'Source Code Pro' (monospace) for displaying pipeline execution logs or configuration snippets, ensuring precise alignment and readability of technical details.
- Utilize a consistent set of clean, vector-based line icons. These icons should clearly represent actions such as 'Upload File', 'Run Pipeline', 'View Data', and include intuitive status indicators to convey processing states.
- Implement a structured two-column layout, featuring a fixed sidebar for pipeline selection and navigation, and a flexible main content area for detailed configurations, file uploads, and data display. Emphasize generous whitespace and clear sectional divisions to maintain an organized and user-friendly interface.
- Incorporate subtle and swift animations for state changes, including loading indicators during pipeline execution, confirmation feedback for form submissions, and smooth component transitions, designed to enhance user experience without creating distractions.