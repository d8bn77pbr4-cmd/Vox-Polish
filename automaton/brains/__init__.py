from .heuristic import HeuristicBrain

__all__ = ["HeuristicBrain", "ClaudeBrain"]


def __getattr__(name):
    # Imported lazily so the free heuristic brain works without the anthropic package configured.
    if name == "ClaudeBrain":
        from .claude import ClaudeBrain
        return ClaudeBrain
    raise AttributeError(name)
