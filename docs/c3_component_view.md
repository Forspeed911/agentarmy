```mermaid
flowchart TD
    A[Request Intake]
    B[Research Planner]
    C[Task Dispatcher]
    D[Evidence Validator]
    E[Critic Loop Manager]
    F[Decision Pack Builder]
    G[Build Initiator]
    H[GTM/Run Initiator]

    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
    G --> H
```
