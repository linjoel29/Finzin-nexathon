// AuthContext.jsx - Global authentication and security state management.
// Handles session persistence, OTP verification flow, new student registration,
// app reopen PIN lockouts, and PIN reset with fresh OTP verification.
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setToken, getToken, setStoredUser, getStoredUser, clearAuth, onUnauthorized } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Restore initial state from sessionStorage
  const [token, setTokenState] = useState(() => getToken());
  const [user, setUserState] = useState(() => getStoredUser());

  // If a session token exists on page load/reopen, the app locks and requires PIN unlock
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Authentication flow steps: 'login' | 'otp' | 'register' | 'forgot_pin_otp' | 'forgot_pin_new'
  const [authStep, setAuthStep] = useState(() => (getToken() ? 'unlock' : 'login'));
  const [tempEmail, setTempEmail] = useState('');
  const [registrationToken, setRegistrationToken] = useState(null);
  const [resetSessionToken, setResetSessionToken] = useState(null); // Fresh token for PIN reset
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Auto-logout when API receives 401 Unauthorized
  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      setTokenState(null);
      setUserState(null);
      setIsUnlocked(false);
      setAuthStep('login');
      setError('Session expired. Please log in again.');
    });
    return unsubscribe;
  }, []);

  // Sync token changes to storage and state
  const saveAuthSession = useCallback((newToken, newUser) => {
    setToken(newToken);
    setStoredUser(newUser);
    setTokenState(newToken);
    setUserState(newUser);
    setIsUnlocked(true);
    setAuthStep('authenticated');
    setError(null);
  }, []);

  // Request a 6-digit OTP code to the student's email
  const sendOtp = useCallback(async (email) => {
    setLoading(true);
    setError(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      await api.post('/auth/send-otp', { email: normalizedEmail });
      setTempEmail(normalizedEmail);
      setAuthStep('otp');
      return true;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Verify the OTP code
  const verifyOtp = useCallback(async (code) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post('/auth/verify-otp', {
        email: tempEmail,
        code: code.trim(),
      });

      if (result.isNewUser) {
        // Unregistered user -> transition to student registration form
        setRegistrationToken(result.registrationToken);
        setAuthStep('register');
        return { isNewUser: true };
      }

      // Existing user -> auto-login to dashboard
      saveAuthSession(result.token, result.user);
      return { isNewUser: false, user: result.user };
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [tempEmail, saveAuthSession]);

  // Complete student registration form
  const register = useCallback(async (formData) => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...formData,
        registrationToken,
      };
      const result = await api.post('/auth/register', payload);
      saveAuthSession(result.token, result.user);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [registrationToken, saveAuthSession]);

  // Unlock app with 4-digit PIN upon app reopen
  const unlock = useCallback(async (pin) => {
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/unlock', { pin });
      setIsUnlocked(true);
      setAuthStep('authenticated');
      return true;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Start "Forgot PIN" flow: sends OTP to the currently logged in user's email
  const startForgotPin = useCallback(async () => {
    if (!user?.email) {
      // If no stored email, prompt user to log in from scratch
      clearAuth();
      setTokenState(null);
      setUserState(null);
      setAuthStep('login');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/send-otp', { email: user.email });
      setTempEmail(user.email);
      setAuthStep('forgot_pin_otp');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Verify OTP for PIN reset
  const verifyForgotPinOtp = useCallback(async (code) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post('/auth/verify-otp', {
        email: tempEmail,
        code: code.trim(),
      });
      // Store the fresh session token that has otpFresh=true
      setResetSessionToken(result.token);
      setToken(result.token); // Temporarily activate for reset-pin call
      setAuthStep('forgot_pin_new');
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [tempEmail]);

  // Set the new PIN using the fresh OTP session token
  const resetPin = useCallback(async (newPin) => {
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/reset-pin', { newPin });
      // Restore active session token and unlock dashboard
      setTokenState(resetSessionToken);
      setToken(resetSessionToken);
      setIsUnlocked(true);
      setAuthStep('authenticated');
      setResetSessionToken(null);
      return true;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [resetSessionToken]);

  // Explicit user logout
  const logout = useCallback(() => {
    clearAuth();
    setTokenState(null);
    setUserState(null);
    setIsUnlocked(false);
    setAuthStep('login');
    setError(null);
    setTempEmail('');
    setRegistrationToken(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isUnlocked,
        authStep,
        tempEmail,
        loading,
        error,
        setError,
        setAuthStep,
        sendOtp,
        verifyOtp,
        register,
        unlock,
        startForgotPin,
        verifyForgotPinOtp,
        resetPin,
        logout,
        setUser: setUserState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
