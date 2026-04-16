import { useState, useCallback } from "react";

const TOKEN_KEY = "friday-remote-token";

export function useAuth() {
	const [token, setTokenState] = useState<string | null>(() => {
		// Check URL hash first (for shareable links), then localStorage
		const hash = window.location.hash.slice(1);
		const params = new URLSearchParams(hash);
		const hashToken = params.get("token");
		if (hashToken) {
			localStorage.setItem(TOKEN_KEY, hashToken);
			// Clean URL — remove token from hash
			window.history.replaceState(null, "", window.location.pathname + window.location.search);
			return hashToken;
		}
		return localStorage.getItem(TOKEN_KEY);
	});

	const setToken = useCallback((t: string) => {
		localStorage.setItem(TOKEN_KEY, t);
		setTokenState(t);
	}, []);

	const clearToken = useCallback(() => {
		localStorage.removeItem(TOKEN_KEY);
		setTokenState(null);
	}, []);

	const isLocalhost =
		window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
	const needsAuth = !isLocalhost;
	const isAuthenticated = !needsAuth || !!token;

	return { token, setToken, clearToken, needsAuth, isAuthenticated };
}
