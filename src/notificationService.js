import { LocalNotifications } from '@capacitor/local-notifications';

// In-app audio chime using Web Audio API (works natively inside WebView)
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
      // High-priority dual-beep "Shift Reminder" chime (880Hz -> 880Hz)
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
    // 1. Check and request native Capacitor permissions
    if (typeof LocalNotifications !== 'undefined') {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        const res = await LocalNotifications.requestPermissions();
        if (res.display !== 'granted') {
          console.warn('Native notification permission was not granted by user.');
        }
      }

      // 2. Configure Android Notification Channels with High Importance (Android 8.0+)
      try {
        await LocalNotifications.createChannel({
          id: 'motodc_shift_alerts',
          name: 'Shift Check-In & Attendance',
          description: 'Daily reminders to check in at Karaikal Hub before shift cutoff',
          importance: 5, // High / Heads-up
          visibility: 1, // Public
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
        console.warn('Channel creation error (normal on web or older devices):', chanErr);
      }

      // 3. Register Daily Recurring Shift Check-in Alarms
      await scheduleRecurringShiftReminders();
    }

    // 3. Web Notification API Fallback (for browser/PWA testing)
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
 * Schedules recurring daily local notifications for MotoDC Shift Check-in windows.
 * Fires at:
 * - 08:15 AM (Check-in window opens for Standard Shift)
 * - 08:45 AM (15-minute warning before 9:00 AM late cutoff)
 * - 01:45 PM (Afternoon window opens for Split Shift)
 */
export const scheduleRecurringShiftReminders = async () => {
  try {
    if (typeof LocalNotifications === 'undefined') return;

    // Check existing pending notifications so we do not duplicate
    const pending = await LocalNotifications.getPending();
    const existingIds = new Set(pending.notifications.map((n) => n.id));

    const notificationsToSchedule = [];

    // Notification A: 08:15 AM Daily Check-In Window Opens
    if (!existingIds.has(8150)) {
      notificationsToSchedule.push({
        id: 8150,
        title: '⏰ MotoDC Shift Check-In Open',
        body: 'Karaikal Hub check-in window is now open (8:15 AM – 9:00 AM). Log in now to protect your ₹2,500 monthly bonus!',
        channelId: 'motodc_shift_alerts',
        schedule: {
          on: { hour: 8, minute: 15 },
          repeats: true,
          every: 'day',
          allowWhileIdle: true,
        },
      });
    }

    // Notification B: 08:45 AM Daily 15-Minute Warning
    if (!existingIds.has(8450)) {
      notificationsToSchedule.push({
        id: 8450,
        title: '⚠️ 15 Mins to Check-In Cutoff!',
        body: 'Check in before 9:00 AM sharp to avoid a Late Attendance Strike and maintain your punctuality bonus.',
        channelId: 'motodc_shift_alerts',
        schedule: {
          on: { hour: 8, minute: 45 },
          repeats: true,
          every: 'day',
          allowWhileIdle: true,
        },
      });
    }

    // Notification C: 01:45 PM Afternoon Window
    if (!existingIds.has(13450)) {
      notificationsToSchedule.push({
        id: 13450,
        title: '⏰ Afternoon Shift Check-In Open',
        body: 'Afternoon check-in window is now open (1:45 PM – 2:00 PM). Log in at Karaikal Hub.',
        channelId: 'motodc_shift_alerts',
        schedule: {
          on: { hour: 13, minute: 45 },
          repeats: true,
          every: 'day',
          allowWhileIdle: true,
        },
      });
    }

    if (notificationsToSchedule.length > 0) {
      await LocalNotifications.schedule({ notifications: notificationsToSchedule });
    }
  } catch (err) {
    console.warn('Error scheduling recurring shift reminders:', err);
  }
};

/**
 * Send an immediate native local notification with web fallback
 */
export const sendLocalNotification = async ({ id, title, body, channelId = 'motodc_packages_alerts' }) => {
  // 1. Play in-app audio chime
  playNotificationChime(channelId === 'motodc_packages_alerts' ? 'package' : 'shift');

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
            schedule: { at: new Date(Date.now() + 100) },
          },
        ],
      });
      nativeScheduled = true;
    }
  } catch (nativeErr) {
    console.warn('Native LocalNotification failed, falling back to Web API:', nativeErr);
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
};
