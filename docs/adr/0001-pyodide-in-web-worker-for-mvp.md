# Pyodide in Web Worker for MVP execution

Student code runs only in the browser via Pyodide inside a Web Worker. This satisfies weak-connection and cost constraints for MVP and keeps the page responsive via timeout and Stop button. Server-side sandbox (Firecracker/gVisor) is deferred to post-MVP for hidden-test integrity.

Considered Options: server sandbox from day one (more secure but costly and network-dependent), Monaco+server run, or Skulpt (smaller but incomplete).

Consequences: imports restricted to allowlist, hidden tests inspectable by technical students until server execution lands.
