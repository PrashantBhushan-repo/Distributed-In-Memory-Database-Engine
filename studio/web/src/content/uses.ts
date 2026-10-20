export const areas = [
  { title: 'Dashboard', path: '/dashboard', group: 'Beginner', icon: 'activity', description: 'See the big picture. Then zoom in.', capability: 'INFO' },
  { title: 'Key Explorer', path: '/keys', group: 'Beginner', icon: 'database', description: 'A home for every key and value.', capability: 'SCAN' },
  { title: 'Console', path: '/console', group: 'Beginner', icon: 'terminal', description: 'Your commands. Clear replies.' },
  { title: 'Playground', path: '/playground', group: 'Beginner', icon: 'layers', description: 'Get your hands on the data structures.' },
  { title: 'Memory & Eviction', path: '/memory', group: 'Engineer', icon: 'cpu', description: 'Find where the bytes go.', capability: 'INFO' },
  { title: 'Expiration', path: '/expiration', group: 'Operator', icon: 'clock', description: 'Give your data a lifetime.', capability: 'TTL' },
  { title: 'Clients', path: '/clients', group: 'Operator', icon: 'users', description: 'Know who is connected.', capability: 'CLIENT' },
  { title: 'Slow Log', path: '/slowlog', group: 'Engineer', icon: 'activity', description: 'Investigate the commands that linger.', capability: 'SLOWLOG' },
  { title: 'Persistence', path: '/persistence', group: 'Operator', icon: 'save', description: 'Follow data beyond memory.', capability: 'SAVE' },
  { title: 'Replication', path: '/replication', group: 'Engineer', icon: 'branch', description: 'Trace a write to its replicas.', capability: 'PSYNC' },
  { title: 'Security & ACL', path: '/security', group: 'Operator', icon: 'shield', description: 'Make access intentional.', capability: 'ACL' },
  { title: 'Configuration', path: '/config', group: 'Operator', icon: 'settings', description: 'Understand every setting.', capability: 'CONFIG' },
  { title: 'Metrics', path: '/metrics', group: 'Engineer', icon: 'chart', description: 'Turn activity into a timeline.' },
  { title: 'Live Monitor', path: '/monitor', group: 'Engineer', icon: 'monitor', description: 'See commands as they happen.' },
  { title: 'Pub/Sub', path: '/pubsub', group: 'Engineer', icon: 'radio', description: 'Watch messages move.', capability: 'PUBLISH' },
  { title: 'Learn', path: '/learn', group: 'Beginner', icon: 'book', description: 'Build intuition, one experiment at a time.' },
] satisfies Array<{ title: string; path: string; group: string; icon: string; description: string; capability?: string }>;
export const uses = [
  { title: 'Learning Redis', text: 'Turn the commands you know into concepts you understand.', path: '/learn/labs', tag: 'THE CURIOUS BEGINNER' },
  { title: 'Debugging memory', text: 'Trace a memory question back to the keys behind it.', path: '/memory', tag: 'THE PROBLEM SOLVER' },
  { title: 'Teaching a class', text: 'Make the invisible parts of a database visible together.', path: '/playground', tag: 'THE EXPLAINER' },
  { title: 'Interview walkthrough', text: 'Follow a request and talk through the design decisions.', path: '/learn/tour', tag: 'THE SYSTEMS THINKER' },
  { title: 'Benchmarking', text: 'Inspect workloads and measurement methods before comparing.', path: '/metrics', tag: 'THE EXPERIMENTER' },
  { title: 'Studying systems design', text: 'Connect the C++ engine to the behavior on your screen.', path: '/learn/tour', tag: 'THE BUILDER' },
];
export const runs = [
  { title: 'Browser preview', tag: 'START HERE', text: 'Meet the Studio. Nothing to install.', command: 'SET user:1 Prashant\nGET user:1', requirements: 'A modern browser. No account for the preview.', first: 'Try a command in the isolated sandbox.', action: 'Open live demo', href: '#studio-preview' },
  { title: 'Docker', tag: 'THE WHOLE STACK', text: 'Engine, gateway, and Studio together.', command: 'docker compose up -d --build', requirements: 'Docker Compose and a clone of this repository.', first: 'Open localhost:3000 after the services start.', action: 'Read the Docker setup', href: '#readme' },
  { title: 'From source', tag: 'GET CLOSER', text: 'Build the engine. Read every line.', command: 'cmake -B build-wsl -S .\ncmake --build build-wsl --target redisx', requirements: 'Linux / WSL, CMake, and a C++20 compiler.', first: 'Launch the engine, then the gateway and Studio.', action: 'Read the build guide', href: '#readme' },
];
export const stages = [
  { title: 'Client', text: 'Your application encodes a command. The request begins as protocol bytes.' },
  { title: 'TCP', text: 'A socket carries bytes to the server. Connections can send multiple requests.' },
  { title: 'epoll', text: 'The event loop watches ready sockets. It dispatches work without a thread per client.' },
  { title: 'RESP parser', text: 'The parser turns bytes into arguments. Incomplete requests wait for more input.' },
  { title: 'Dispatcher', text: 'The command name selects a handler. The handler checks its arguments.' },
  { title: 'Transaction', text: 'Commands can be queued in a transaction. Execution follows the engine’s transaction rules.' },
  { title: 'Database API', text: 'The database locates the keyspace. It handles values and expiration metadata.' },
  { title: 'Storage engine', text: 'The value is stored in memory. Its representation depends on the data type.' },
  { title: 'Subsystems', text: 'Persistence and replication handle their configured work. Inspect their settings to understand durability.' },
];
