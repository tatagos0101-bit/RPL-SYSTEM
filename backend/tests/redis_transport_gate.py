"""Test-only TCP relay: interrupt one client's transport without changing Redis."""
import select
import socket
import threading


class RedisTransportGate:
    def __init__(self, upstream):
        self.upstream = upstream
        self.online = threading.Event()
        self.online.set()
        self.closed = threading.Event()
        self.lock = threading.Lock()
        self.connections = set()
        self.workers = []
        self.listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.listener.bind(("127.0.0.1", 0))
        self.listener.listen()
        self.listener.settimeout(0.1)
        self.port = self.listener.getsockname()[1]
        self.thread = threading.Thread(target=self._accept, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    @staticmethod
    def _close(connection):
        try:
            connection.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        connection.close()

    def pause(self):
        self.online.clear()
        with self.lock:
            for connection in tuple(self.connections):
                self._close(connection)
            self.connections.clear()

    def resume(self):
        self.online.set()

    def _accept(self):
        while not self.closed.is_set():
            try:
                client, _ = self.listener.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            if not self.online.is_set():
                self._close(client)
                continue
            worker = threading.Thread(target=self._relay, args=(client,), daemon=True)
            self.workers.append(worker)
            worker.start()

    def _relay(self, client):
        upstream = None
        try:
            upstream = socket.create_connection(self.upstream, timeout=2)
            with self.lock:
                if not self.online.is_set() or self.closed.is_set():
                    return
                self.connections.update((client, upstream))
            while self.online.is_set() and not self.closed.is_set():
                ready, _, _ = select.select([client, upstream], [], [], 0.1)
                for source in ready:
                    data = source.recv(65536)
                    if not data:
                        return
                    (upstream if source is client else client).sendall(data)
        except (OSError, ValueError):
            pass
        finally:
            with self.lock:
                for connection in (client, upstream):
                    if connection is not None:
                        self.connections.discard(connection)
                        self._close(connection)

    def __exit__(self, *exc):
        self.closed.set()
        self.pause()
        self.listener.close()
        self.thread.join(timeout=3)
        for worker in self.workers:
            worker.join(timeout=3)
