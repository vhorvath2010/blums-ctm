"""A level-based introduction to the Conscious Turing Machine.

Deliberately does not import the HTTP server: the in-browser build imports this
package under Pyodide, where there is no server to run.
"""

from .routes import dispatch
from .session import Game

__all__ = ["Game", "dispatch"]
