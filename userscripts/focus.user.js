// ==UserScript==
// @name         Focus Guardian - Attention Span Manager
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Block distracting websites and redirect to productive alternatives with break timers
// @author       You
// @match        http://*/*
// @match        https://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    console.log('Focus Guardian: Script loaded');

    // ============================================
    // CONFIGURATION - Customize these arrays
    // ============================================

    // Websites to block (distracting sites)
    const BLOCKED_SITES = [
        'youtube.com',
        'facebook.com',
        'twitter.com',
        'x.com',
        'reddit.com',
        'tiktok.com',
        'netflix.com',
        'twitch.tv',
        '9gag.com'
    ];

    // YouTube channels that are ALWAYS allowed (educational/productive creators)
    // Add channel IDs or channel handles here
    const WHITELISTED_YOUTUBE_CHANNELS = [
        // Educational Channels
        'veritasium',           // Veritasium
        '3blue1brown',          // 3Blue1Brown
        'kurzgesagt',           // Kurzgesagt – In a Nutshell
        'freecodecamp',         // FreeCodeCamp
        'techwithtim',          // Tech With Tim
        'traversymedia',        // Traversy Media
        'fireship',             // Fireship
        'networkchuck',         // NetworkChuck
        'codecourse',           // Codecourse
        'codingtrain',          // The Coding Train
        'crashcourse',          // CrashCourse
        'khanacademy',          // Khan Academy
        'tedtalks',             // TED Talks
        'vsauce',               // Vsauce
        'minutephysics',        // MinutePhysics
        'computerphile',        // Computerphile
        'numberphile',          // Numberphile
        'mitocw',               // MIT OpenCourseWare
        'stanfordonline',       // Stanford Online

        // Add your own favorite educational channels here:
        // 'channelname',
    ];

    // Productive alternatives to suggest
    const PRODUCTIVE_SITES = [
        { name: 'Khan Academy', url: 'https://www.khanacademy.org', icon: '📚' },
        { name: 'Coursera', url: 'https://www.coursera.org', icon: '🎓' },
        { name: 'GitHub', url: 'https://github.com', icon: '💻' },
        { name: 'Medium', url: 'https://medium.com', icon: '📝' },
        { name: 'Stack Overflow', url: 'https://stackoverflow.com', icon: '💡' },
        { name: 'Wikipedia', url: 'https://wikipedia.org', icon: '📖' },
        { name: 'Udemy', url: 'https://www.udemy.com', icon: '🎯' },
        { name: 'FreeCodeCamp', url: 'https://www.freecodecamp.org', icon: '⚡' }
    ];

    // ============================================
    // STATE MANAGEMENT
    // ============================================

    const STATE = {
        isOnBreak: () => {
            const breakEnd = GM_getValue('breakEndTime', 0);
            const result = Date.now() < breakEnd;
            console.log('Focus Guardian: Is on break?', result);
            return result;
        },
        setBreak: (minutes) => {
            const endTime = Date.now() + (minutes * 60 * 1000);
            GM_setValue('breakEndTime', endTime);
            console.log('Focus Guardian: Break set for', minutes, 'minutes');
        },
        clearBreak: () => {
            GM_setValue('breakEndTime', 0);
            console.log('Focus Guardian: Break cleared');
        },
        getBreakTimeLeft: () => {
            const breakEnd = GM_getValue('breakEndTime', 0);
            const timeLeft = Math.max(0, breakEnd - Date.now());
            return Math.ceil(timeLeft / 1000);
        }
    };

    // ============================================
    // YOUTUBE WHITELIST CHECKING
    // ============================================

    function isYouTubeWhitelisted() {
        const currentHost = window.location.hostname.toLowerCase();

        // Only check if we're on YouTube
        if (!currentHost.includes('youtube.com')) {
            return false;
        }

        const currentPath = window.location.pathname.toLowerCase();
        const currentUrl = window.location.href.toLowerCase();

        // ALWAYS allow YouTube search page
        if (currentPath.includes('/results') || currentUrl.includes('search_query=')) || currentUrl.includes('/watch')) {
            console.log('Focus Guardian: YouTube search allowed');
            return true;
        }

        // Check if current page is a whitelisted channel
        // YouTube URLs can be: /c/channelname, /@channelname, /channel/ID, or /user/username
        for (let channel of WHITELISTED_YOUTUBE_CHANNELS) {
            const channelLower = channel.toLowerCase();

            // Check various YouTube URL formats
            if (currentPath.includes('/@' + channelLower) ||
                currentPath.includes('/c/' + channelLower) ||
                currentPath.includes('/user/' + channelLower) ||
                currentUrl.includes('/' + channelLower)) {
                console.log('Focus Guardian: Whitelisted YouTube channel detected:', channel);
                return true;
            }
        }

        // Check if watching a video from a whitelisted channel
        // This checks the channel name in the URL or page
        const channelMatch = document.querySelector('ytd-channel-name a, #channel-name a, #owner-name a');
        if (channelMatch) {
            const channelHref = channelMatch.getAttribute('href') || '';
            for (let channel of WHITELISTED_YOUTUBE_CHANNELS) {
                if (channelHref.toLowerCase().includes(channel.toLowerCase())) {
                    console.log('Focus Guardian: Watching whitelisted channel:', channel);
                    return true;
                }
            }
        }

        return false;
    }

    // ============================================
    // CHECK IF CURRENT SITE IS BLOCKED
    // ============================================

    function isCurrentSiteBlocked() {
        const currentHost = window.location.hostname.toLowerCase();
        const isBlocked = BLOCKED_SITES.some(site => {
            return currentHost.includes(site.toLowerCase());
        });
        console.log('Focus Guardian: Current host:', currentHost, 'Blocked:', isBlocked);
        return isBlocked;
    }

    // ============================================
    // STYLES
    // ============================================

    GM_addStyle(`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        #focus-guardian-break-timer {
            position: fixed !important;
            top: 20px !important;
            right: 20px !important;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            color: white !important;
            padding: 16px 24px !important;
            border-radius: 16px !important;
            box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4) !important;
            z-index: 2147483647 !important;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
            min-width: 200px !important;
            animation: slideInRight 0.3s ease-out !important;
        }

        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        #focus-guardian-break-timer-title {
            font-size: 12px !important;
            font-weight: 600 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
            opacity: 0.9 !important;
            margin-bottom: 8px !important;
        }

        #focus-guardian-break-timer-value {
            font-size: 28px !important;
            font-weight: 700 !important;
            font-variant-numeric: tabular-nums !important;
            margin-bottom: 12px !important;
        }

        #focus-guardian-break-timer-end {
            background: rgba(255, 255, 255, 0.2) !important;
            border: 2px solid rgba(255, 255, 255, 0.3) !important;
            color: white !important;
            padding: 8px 16px !important;
            border-radius: 8px !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            width: 100% !important;
            font-family: 'Inter', sans-serif !important;
        }

        #focus-guardian-break-timer-end:hover {
            background: rgba(255, 255, 255, 0.3) !important;
            border-color: rgba(255, 255, 255, 0.5) !important;
        }

        body.focus-guardian-blocked {
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            height: 100vh !important;
        }

        .focus-guardian-overlay {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            z-index: 2147483647 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
            animation: fadeIn 0.3s ease-in !important;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .focus-guardian-container {
            background: rgba(255, 255, 255, 0.98) !important;
            border-radius: 24px !important;
            padding: 48px !important;
            max-width: 600px !important;
            width: 90% !important;
            max-height: 90vh !important;
            overflow-y: auto !important;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3) !important;
            animation: slideUp 0.4s ease-out !important;
            box-sizing: border-box !important;
        }

        @keyframes slideUp {
            from {
                transform: translateY(30px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }

        .focus-guardian-header {
            text-align: center !important;
            margin-bottom: 32px !important;
        }

        .focus-guardian-icon {
            font-size: 64px !important;
            margin-bottom: 16px !important;
            animation: pulse 2s ease-in-out infinite !important;
        }

        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }

        .focus-guardian-title {
            font-size: 32px !important;
            font-weight: 700 !important;
            color: #1a202c !important;
            margin: 0 0 8px 0 !important;
        }

        .focus-guardian-subtitle {
            font-size: 16px !important;
            color: #718096 !important;
            margin: 0 !important;
        }

        .focus-guardian-message {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%) !important;
            border-left: 4px solid #f59e0b !important;
            padding: 16px !important;
            border-radius: 12px !important;
            margin-bottom: 32px !important;
            font-size: 15px !important;
            color: #78350f !important;
            line-height: 1.6 !important;
        }

        .focus-guardian-section {
            margin-bottom: 32px !important;
        }

        .focus-guardian-section-title {
            font-size: 14px !important;
            font-weight: 600 !important;
            color: #4a5568 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
            margin-bottom: 16px !important;
        }

        .focus-guardian-sites {
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)) !important;
            gap: 12px !important;
            margin-bottom: 24px !important;
        }

        .focus-guardian-site-card {
            background: white !important;
            border: 2px solid #e2e8f0 !important;
            border-radius: 12px !important;
            padding: 16px !important;
            text-align: center !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            text-decoration: none !important;
            color: inherit !important;
            display: block !important;
        }

        .focus-guardian-site-card:hover {
            border-color: #667eea !important;
            transform: translateY(-2px) !important;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15) !important;
        }

        .focus-guardian-site-icon {
            font-size: 32px !important;
            margin-bottom: 8px !important;
        }

        .focus-guardian-site-name {
            font-size: 14px !important;
            font-weight: 500 !important;
            color: #2d3748 !important;
        }

        .focus-guardian-buttons {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 12px !important;
            margin-bottom: 16px !important;
        }

        .focus-guardian-button {
            padding: 14px 24px !important;
            border: none !important;
            border-radius: 12px !important;
            font-size: 15px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            font-family: 'Inter', sans-serif !important;
        }

        .focus-guardian-button-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            color: white !important;
        }

        .focus-guardian-button-primary:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4) !important;
        }

        .focus-guardian-button-danger {
            background: linear-gradient(135deg, #f56565 0%, #c53030 100%) !important;
            color: white !important;
        }

        .focus-guardian-button-danger:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 4px 12px rgba(245, 101, 101, 0.4) !important;
        }

        .focus-guardian-emergency {
            display: grid !important;
            grid-template-columns: 1fr 1fr 1fr !important;
            gap: 8px !important;
        }

        .focus-guardian-emergency-button {
            padding: 10px !important;
            border: 2px solid #e2e8f0 !important;
            border-radius: 8px !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            background: white !important;
            color: #2d3748 !important;
            transition: all 0.2s ease !important;
            font-family: 'Inter', sans-serif !important;
        }

        .focus-guardian-emergency-button:hover {
            border-color: #f59e0b !important;
            background: #fffbeb !important;
            color: #f59e0b !important;
        }

        .focus-guardian-footer {
            text-align: center !important;
            padding-top: 24px !important;
            border-top: 1px solid #e2e8f0 !important;
            font-size: 13px !important;
            color: #a0aec0 !important;
        }
    `);

    // ============================================
    // CREATE FLOATING BREAK TIMER
    // ============================================

    function createFloatingBreakTimer() {
        console.log('Focus Guardian: Creating floating break timer');

        // Remove existing timer if present
        const existingTimer = document.getElementById('focus-guardian-break-timer');
        if (existingTimer) {
            existingTimer.remove();
        }

        const timer = document.createElement('div');
        timer.id = 'focus-guardian-break-timer';

        const timeLeft = STATE.getBreakTimeLeft();

        timer.innerHTML = `
            <div id="focus-guardian-break-timer-title">⏰ BREAK TIME</div>
            <div id="focus-guardian-break-timer-value">${formatTime(timeLeft)}</div>
            <button id="focus-guardian-break-timer-end">End Break</button>
        `;

        document.body.appendChild(timer);

        // Update timer every second
        const timerInterval = setInterval(() => {
            const timeLeft = STATE.getBreakTimeLeft();
            const timerValue = document.getElementById('focus-guardian-break-timer-value');

            if (timerValue) {
                timerValue.textContent = formatTime(timeLeft);
            }

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                STATE.clearBreak();
                location.reload();
            }
        }, 1000);

        // End break button
        const endBtn = document.getElementById('focus-guardian-break-timer-end');
        if (endBtn) {
            endBtn.addEventListener('click', () => {
                if (confirm('⚠️ Are you sure you want to end your break early?')) {
                    clearInterval(timerInterval);
                    STATE.clearBreak();
                    location.reload();
                }
            });
        }
    }

    // ============================================
    // CREATE BLOCKING INTERFACE
    // ============================================

    function createBlockingInterface() {
        console.log('Focus Guardian: Creating blocking interface');

        // Add class to body
        document.body.classList.add('focus-guardian-blocked');

        // Remove all existing content
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }

        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'focus-guardian-overlay';

        const container = document.createElement('div');
        container.className = 'focus-guardian-container';

        // Blocking interface
        container.innerHTML = `
            <div class="focus-guardian-header">
                <div class="focus-guardian-icon">🎯</div>
                <h1 class="focus-guardian-title">Stay Focused!</h1>
                <p class="focus-guardian-subtitle">This site is on your distraction list</p>
            </div>

            <div class="focus-guardian-message">
                💡 <strong>Remember:</strong> You blocked this site to help improve your focus and productivity. Consider visiting one of these alternatives instead!
            </div>

            <div class="focus-guardian-section">
                <div class="focus-guardian-section-title">✨ Productive Alternatives</div>
                <div class="focus-guardian-sites">
                    ${PRODUCTIVE_SITES.map(site => `
                        <a href="${site.url}" class="focus-guardian-site-card">
                            <div class="focus-guardian-site-icon">${site.icon}</div>
                            <div class="focus-guardian-site-name">${site.name}</div>
                        </a>
                    `).join('')}
                </div>
            </div>

            <div class="focus-guardian-section">
                <div class="focus-guardian-section-title">⏱️ Take a Break</div>
                <div class="focus-guardian-buttons">
                    <button class="focus-guardian-button focus-guardian-button-primary" id="studyBreakBtn">
                        📚 Study Break<br><small style="font-weight: 400; opacity: 0.9;">15 minutes</small>
                    </button>
                    <button class="focus-guardian-button focus-guardian-button-primary" id="launchBreakBtn">
                        🍽️ Lunch Break<br><small style="font-weight: 400; opacity: 0.9;">30 minutes</small>
                    </button>
                </div>
            </div>

            <div class="focus-guardian-section">
                <div class="focus-guardian-section-title">🚨 Emergency Access</div>
                <div class="focus-guardian-emergency">
                    <button class="focus-guardian-emergency-button" data-minutes="5">5 min</button>
                    <button class="focus-guardian-emergency-button" data-minutes="10">10 min</button>
                    <button class="focus-guardian-emergency-button" data-minutes="15">15 min</button>
                </div>
            </div>

            <div class="focus-guardian-footer">
                Focus Guardian • Helping you build better habits
            </div>
        `;

        overlay.appendChild(container);
        document.body.appendChild(overlay);

        // Event listeners
        document.getElementById('studyBreakBtn').addEventListener('click', () => {
            STATE.setBreak(15);
            location.reload();
        });

        document.getElementById('launchBreakBtn').addEventListener('click', () => {
            STATE.setBreak(30);
            location.reload();
        });

        document.querySelectorAll('.focus-guardian-emergency-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const minutes = parseInt(e.target.dataset.minutes);
                if (confirm(`⚠️ Are you sure you need ${minutes} minutes of emergency access?\n\nUse this time wisely!`)) {
                    STATE.setBreak(minutes);
                    location.reload();
                }
            });
        });

        console.log('Focus Guardian: Interface created successfully');
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // ============================================
    // MAIN EXECUTION
    // ============================================

    const shouldBlock = isCurrentSiteBlocked();
    const onBreak = STATE.isOnBreak();
    const whitelisted = isYouTubeWhitelisted();

    console.log('Focus Guardian: Decision - Blocked:', shouldBlock, 'On Break:', onBreak, 'Whitelisted:', whitelisted);

    if (shouldBlock && !onBreak && !whitelisted) {
        // Site is blocked, not on break, not whitelisted -> BLOCK
        console.log('Focus Guardian: Blocking site');
        createBlockingInterface();
    } else if (shouldBlock && onBreak) {
        // Site is blocked but user is on break -> ALLOW with timer
        console.log('Focus Guardian: On break, showing timer');
        createFloatingBreakTimer();
    } else if (whitelisted) {
        // YouTube whitelisted content -> ALLOW without timer
        console.log('Focus Guardian: Whitelisted content, allowing access');
    } else {
        console.log('Focus Guardian: Site not blocked');
    }

})();
