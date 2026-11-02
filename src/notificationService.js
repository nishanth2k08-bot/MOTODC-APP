import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Safe in-app audio chime using Web Audio API
 */
export const playNotificationChime = (type = 'package') => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === 'package') {
      // Pleasant dual-tone "Package Arrived" chime (523Hz -> 659Hz -> 784Hz)
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.12);
        osc.stop(ctx.currentTime + idx * 0.12 + 0.25);
      });
    } else {
      // Dual-beep "Shift Reminder" chime (880Hz -> 880Hz)
      [0, 0.18].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.25, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.15);
      });
    }
  } catch (_) {
    // Audio context may be restricted before user gesture
  }
};

/**
 * Request notification permissions and configure Android Notification Channels
 */
export const initNotifications = async () => {
  try {
    if (typeof LocalNotifications !== 'undefined') {
      try {
        const perm = await LocalNotifications.checkPermissions();
        if (perm && perm.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }
      } catch (permErr) {
        console.warn('Native notification permission check:', permErr);
      }

      // Configure Android Notification Channels with High Importance (Android 8.0+)
      try {
        await LocalNotifications.createChannel({
          id: 'motodc_shift_alerts',
          name: 'Shift Check-In & Attendance',
          description: 'Daily reminders to check in at Karaikal Hub before shift cutoff',
          importance: 5,
          visibility: 1,
          vibration: true,
          lights: true,
          lightColor: '#ff3157',
        });

        await LocalNotifications.createChannel({
          id: 'motodc_packages_alerts',
          name: 'New Packages Assigned',
          description: 'Alerts when packages are staged or corridors are dispatched to you',
          importance: 5,
          visibility: 1,
          vibration: true,
          lights: true,
          lightColor: '#22c55e',
        });
      } catch (chanErr) {
        console.warn('Channel creation error:', chanErr);
      }

      // Register native OS-level scheduled shift alarms in Android AlarmManager
      // (Fires even when app is closed / cleared from Recent Apps)
      try {
        const isAlreadyLoggedIn = Boolean(localStorage.getItem('motodc_partner_rider'));
        if (!isAlreadyLoggedIn) {
          await scheduleNativeShiftAlarms();
        }
      } catch (_) {}
    }

    // Web Notification API Fallback (for browser/PWA testing)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Error during notification initialization:', err);
  }
};

/**
 * Schedules recurring daily shift reminders directly into Android OS AlarmManager.
 * Runs independently of whether the app is active, closed, or cleared from Recent Apps.
 */
export const scheduleNativeShiftAlarms = async () => {
  try {
    if (typeof LocalNotifications === 'undefined') return;

    // Verify permission
    const perm = await LocalNotifications.checkPermissions();
    if (perm && perm.display !== 'granted') return;

    // Avoid duplicate scheduling if already armed in OS AlarmManager
    try {
      const pending = await LocalNotifications.getPending();
      const ids = new Set((pending?.notifications || []).map((n) => n.id));
      if (ids.has(9915) && ids.has(9916)) {
        return;
      }
    } catch (_) {}

    await LocalNotifications.schedule({
      notifications: [
        {
          id: 9915,
          title: '🚨 URGENT: Check-In Cutoff in 15 Mins!',
          body: 'Morning shift check-in closes at 9:00 AM sharp! Log in now to protect your ₹2,500 monthly bonus.',
          channelId: 'motodc_shift_alerts',
          schedule: {
            on: { hour: 8, minute: 45 },
            allowWhileIdle: true,
          },
          isExactNotification: false,
        },
        {
          id: 9916,
          title: '⏰ Karaikal Hub Check-In is Open!',
          body: 'Check-in window is active (8:15 AM – 9:00 AM). Log in now to record on-time attendance.',
          channelId: 'motodc_shift_alerts',
          schedule: {
            on: { hour: 8, minute: 15 },
            allowWhileIdle: true,
          },
          isExactNotification: false,
        },
        {
          id: 9917,
          title: '⏰ Afternoon Shift Check-In is Open!',
          body: 'Afternoon check-in window is active (1:15 PM – 2:00 PM). Log in now at Karaikal Hub.',
          channelId: 'motodc_shift_alerts',
          schedule: {
            on: { hour: 13, minute: 15 },
            allowWhileIdle: true,
          },
          isExactNotification: false,
        },
        {
          id: 9918,
          title: '🏁 Shift Hours Concluded (8:30 PM)',
          body: 'Standard delivery operations have ended for today. Attendance recorded at Karaikal Hub. Rest well!',
          channelId: 'motodc_shift_alerts',
          schedule: {
            on: { hour: 20, minute: 30 },
            allowWhileIdle: true,
          },
          isExactNotification: false,
        },
      ],
    });
    console.log('[MotoDC] Native OS-level shift alarms scheduled successfully.');
  } catch (err) {
    console.warn('[MotoDC] Error scheduling native OS shift alarms:', err);
  }
};

/**
 * Cancels native shift alarms while rider is actively logged in on duty.
 */
export const cancelNativeShiftAlarms = async () => {
  try {
    if (typeof LocalNotifications === 'undefined') return;
    await LocalNotifications.cancel({
      notifications: [{ id: 9915 }, { id: 9916 }, { id: 9917 }, { id: 9918 }],
    });
    console.log('[MotoDC] Native shift alarms disarmed (rider on shift).');
  } catch (err) {
    console.warn('[MotoDC] Error disarming native shift alarms:', err);
  }
};

/**
 * Send an immediate native local notification with web fallback
 */
export const sendLocalNotification = async ({ id, title, body, channelId = 'motodc_packages_alerts' }) => {
  // 1. Play in-app audio chime
  try {
    playNotificationChime(channelId === 'motodc_packages_alerts' ? 'package' : 'shift');
  } catch (_) {}

  // 2. Native Capacitor Local Notification
  let nativeScheduled = false;
  try {
    if (typeof LocalNotifications !== 'undefined') {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: id || Math.floor(10000 + Math.random() * 89999),
            title,
            body,
            channelId,
          },
        ],
      });
      nativeScheduled = true;
    }
  } catch (nativeErr) {
    console.warn('Native LocalNotification schedule error:', nativeErr);
  }

  // 3. Web Notification API Fallback (for browser/PWA testing)
  if (!nativeScheduled && typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
        });
      } catch (_) {}
    }
  }
};

/**
 * Checks if the current time falls inside the Karaikal Hub check-in window
 * and fires an immediate reminder if the rider is not yet checked in.
 */
export const checkAndNotifyLoginTime = (isLoggedIn) => {
  try {
    if (isLoggedIn) return; // Rider is already checked in, no need to alert

    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const ist = new Date(utc + 330 * 60000);
    const minutes = ist.getHours() * 60 + ist.getMinutes();

    // Morning Window: 8:15 AM (495m) to 9:00 AM (540m)
    const isMorningWindow = minutes >= 495 && minutes < 540;
    const isMorningFinalWarning = minutes >= 525 && minutes < 540; // 8:45 AM - 9:00 AM

    // Afternoon Window: 1:15 PM (795m) to 2:00 PM (840m)
    const isAfternoonWindow = minutes >= 795 && minutes < 840;

    const lastNotifiedKey = 'motodc_last_login_notify_' + ist.toISOString().slice(0, 10);
    const lastNotifiedMinute = Number(localStorage.getItem(lastNotifiedKey) || 0);

    // Throttle so we only notify once every 10 minutes while on the login screen
    if (minutes - lastNotifiedMinute >= 10) {
      if (isMorningFinalWarning) {
        sendLocalNotification({
          id: 9901,
          title: '🚨 URGENT: Check-In Cutoff in 15 Mins!',
          body: 'Morning shift check-in closes at 9:00 AM sharp! Log in now to protect your ₹2,500 monthly bonus.',
          channelId: 'motodc_shift_alerts',
        });
        localStorage.setItem(lastNotifiedKey, String(minutes));
      } else if (isMorningWindow) {
        sendLocalNotification({
          id: 9902,
          title: '⏰ Karaikal Hub Check-In is Open!',
          body: 'Check-in window is active (8:15 AM – 9:00 AM). Log in now to record on-time attendance.',
          channelId: 'motodc_shift_alerts',
        });
        localStorage.setItem(lastNotifiedKey, String(minutes));
      } else if (isAfternoonWindow) {
        sendLocalNotification({
          id: 9903,
          title: '⏰ Afternoon Shift Check-In is Open!',
          body: 'Afternoon check-in window is active. Log in now at Karaikal Hub.',
          channelId: 'motodc_shift_alerts',
        });
        localStorage.setItem(lastNotifiedKey, String(minutes));
      }
    }
  } catch (err) {
    console.warn('Error checking login time:', err);
  }
};
