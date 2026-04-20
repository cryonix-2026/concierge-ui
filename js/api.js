export async function fetchLifecycleStatus() {
    const res = await fetch("/api/v1/lifecycle/status");
    return res.json();
}
