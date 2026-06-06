import type { Language } from "@/hooks/usePreferences";

export type Locale = Language | "English";

export const LOCALES: readonly Locale[] = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Japanese",
  "Chinese",
  "Korean",
  "Arabic",
  "Russian",
  "Hindi",
  "Dutch",
] as const;

export type TKey =
  | "home.greeting"
  | "home.subtitleLine1"
  | "home.subtitleLine2"
  | "home.dayStreak"
  | "home.dailyStreak"
  | "home.bestStreak"
  | "home.alphabet"
  | "home.alphabetDesc"
  | "home.letters"
  | "alphabet.title"
  | "alphabet.tapToHear"
  | "alphabet.example"
  | "alphabet.progress"
  | "alphabet.previous"
  | "alphabet.next"
  | "alphabet.complete"
  | "alphabet.completeBody"
  | "alphabet.startOver"
  | "home.aiChats"
  | "home.sessions"
  | "home.vocabulary"
  | "home.vocabTag"
  | "home.pathVocabSub"
  | "home.pathVocabCta"
  | "home.words"
  | "home.dailyGoal"
  | "home.dailyProgress"
  | "home.challenges"
  | "home.earnBadges"
  | "home.pathAlphabetTag"
  | "home.pathAlphabetTitle"
  | "home.pathAlphabetSub"
  | "home.pathAlphabetCta"
  | "home.alphabetMastered"
  | "home.alphabetMasteredSub"
  | "home.alphabetReview"
  | "home.alphabetProgress"
  | "home.alphabetHide"
  | "home.pathSentencesTag"
  | "home.pathSentencesTitle"
  | "home.pathSentencesSub"
  | "home.pathSentencesCta"
  | "home.pathChatTag"
  | "home.pathChatTitle"
  | "home.pathChatSub"
  | "home.pathChatCta"
  | "home.chatErrorTitle"
  | "home.chatErrorBody"
  | "home.continueConvos"
  | "home.newHere"
  | "home.newHereDesc"
  | "home.takeTour"
  | "onboarding.skip"
  | "onboarding.next"
  | "onboarding.getStarted"
  | "onboarding.scanTitle"
  | "onboarding.scanDesc"
  | "onboarding.chatTitle"
  | "onboarding.chatDesc"
  | "onboarding.abcTitle"
  | "onboarding.abcDesc"
  | "onboarding.sentencesTitle"
  | "onboarding.sentencesDesc"
  | "home.scanTag"
  | "home.scanCta"
  | "home.practicing"
  | "home.continueBtn"
  | "home.tapToContinue"
  | "home.scanLearnSpeak"
  | "home.heroDesc"
  | "tabs.home"
  | "tabs.history"
  | "tabs.scan"
  | "settings.title"
  | "settings.learning"
  | "settings.iSpeak"
  | "settings.learningSub"
  | "settings.languages"
  | "settings.preferences"
  | "settings.about"
  | "settings.haptics"
  | "settings.hapticsSub"
  | "settings.daily"
  | "settings.dailySub"
  | "settings.help"
  | "settings.version"
  | "settings.chooseLearning"
  | "settings.chooseNative"
  | "settings.helpAlertTitle"
  | "settings.helpAlertBody"
  | "settings.sameLangTitle"
  | "settings.sameLangBody"
  | "settings.continueAnyway"
  | "settings.nativeComingSoonTitle"
  | "settings.nativeComingSoonBody"
  | "settings.activity"
  | "settings.dailyGoalSub"
  | "settings.challengesSub"
  | "vocab.title"
  | "vocab.all"
  | "vocab.empty"
  | "vocab.emptySub"
  | "vocab.unique"
  | "vocab.from"
  | "vocab.practice"
  | "practice.title"
  | "practice.listen"
  | "practice.tapHear"
  | "practice.showWord"
  | "practice.gotIt"
  | "practice.again"
  | "practice.progress"
  | "practice.from"
  | "practice.doneTitle"
  | "practice.doneBody"
  | "practice.restart"
  | "practice.close"
  | "practice.empty"
  | "practice.emptySub"
  | "progress.title"
  | "progress.today"
  | "progress.complete"
  | "progress.more"
  | "progress.activeDays"
  | "progress.last7"
  | "challenges.title"
  | "challenges.earned"
  | "challenges.keepGoing"
  | "challenges.earnedTag"
  | "history.title"
  | "history.deleteTitle"
  | "history.deleteBody"
  | "history.cancel"
  | "history.delete"
  | "history.empty"
  | "history.emptySub"
  | "scan.captureFailedTitle"
  | "scan.captureFailedBody"
  | "scan.scanFailedTitle"
  | "scan.scanFailedBody"
  | "scan.identified"
  | "scan.tutorSays"
  | "scan.startConversation"
  | "scan.scanAnother"
  | "scan.cameraUnavailableWeb"
  | "scan.cameraNeeded"
  | "scan.enableCamera"
  | "scan.identifying"
  | "scan.history"
  | "scan.gallery"
  | "scan.chooseLanguage"
  | "scan.hint"
  | "scan.title"
  | "conv.placeholder"
  | "conv.title"
  | "conv.about"
  | "conv.errorReply"
  | "conv.fallbackName"
  | "conv.micDeniedTitle"
  | "conv.micDeniedBody"
  | "conv.micErrorTitle"
  | "conv.micErrorBody"
  | "conv.transcribeErrorTitle"
  | "conv.transcribeErrorBody"
  | "conv.transcribeEmptyTitle"
  | "conv.transcribeEmptyBody"
  | "conv.listening"
  | "conv.micTooLongTitle"
  | "conv.micTooLongBody"
  | "conv.grade"
  | "conv.grading"
  | "conv.gradeTitle"
  | "conv.gradePromptTitle"
  | "conv.gradePromptBody"
  | "conv.gradeNow"
  | "conv.gradeAgain"
  | "conv.gradeScore"
  | "conv.gradeStrengths"
  | "conv.gradeMistakes"
  | "conv.gradeNoMistakes"
  | "conv.gradeSuggestions"
  | "conv.gradeClose"
  | "conv.gradedOn"
  | "conv.gradeTooFewTitle"
  | "conv.gradeTooFewBody"
  | "conv.gradeErrorTitle"
  | "conv.gradeErrorBody"
  | "conv.translate"
  | "conv.translating"
  | "conv.hideTranslation"
  | "conv.translateError"
  | "settings.difficulty"
  | "settings.chooseDifficulty"
  | "difficulty.Beginner"
  | "difficulty.Intermediate"
  | "difficulty.Advanced"
  | "difficulty.BeginnerDesc"
  | "difficulty.IntermediateDesc"
  | "difficulty.AdvancedDesc"
  | "scan.chooseLevel"
  | "history.today"
  | "history.yesterday"
  | "history.daysAgo"
  | "history.lockedTitle"
  | "history.lockedBody"
  | "history.switchAndOpen"
  | "history.keepCurrent"
  | "history.currentLangTag"
  | "badge.firstScan.title"
  | "badge.firstScan.desc"
  | "badge.chatty.title"
  | "badge.chatty.desc"
  | "badge.wordHoarder.title"
  | "badge.wordHoarder.desc"
  | "badge.polyglot.title"
  | "badge.polyglot.desc"
  | "badge.consistent.title"
  | "badge.consistent.desc"
  | "badge.century.title"
  | "badge.century.desc"
  | "vocab.bankTitle"
  | "vocab.bankSub"
  | "vocab.beginner"
  | "vocab.intermediate"
  | "vocab.advanced"
  | "vocab.expert"
  | "vocab.add"
  | "vocab.added"
  | "vocab.myWords"
  | "vocab.studySelected"
  | "vocab.tapToSelect"
  | "vocab.selectAll"
  | "vocab.clearSel"
  | "vocab.bankEmpty"
  | "vocab.bankError"
  | "vocab.studyTitle"
  | "vocab.studySub"
  | "vocab.studyEmpty"
  | "vocab.studyEmptySub"
  | "vocab.openBank"
  | "vocab.tapHear"
  | "vocab.example"
  | "vocab.showExample"
  | "vocab.loadingExample"
  | "vocab.yourTurn"
  | "vocab.inputPlaceholder"
  | "vocab.check"
  | "vocab.checking"
  | "vocab.speak"
  | "vocab.recording"
  | "vocab.transcribing"
  | "vocab.scriptHint"
  | "vocab.correct"
  | "vocab.needsWork"
  | "vocab.correction"
  | "vocab.tryAgain"
  | "vocab.next"
  | "vocab.progress"
  | "vocab.remove"
  | "vocab.done"
  | "vocab.doneSub"
  | "vocab.restart"
  | "vocab.actionError"
  | "sentences.title"
  | "sentences.sub"
  | "sentences.error"
  | "sentences.empty"
  | "sentences.greetings"
  | "sentences.basics"
  | "sentences.directions"
  | "sentences.dining"
  | "sentences.shopping"
  | "sentences.emergency";

const en: Record<TKey, string> = {
  "vocab.bankTitle": "Word Bank",
  "vocab.bankSub": "Pick {lang} words you want to learn",
  "vocab.beginner": "Beginner",
  "vocab.intermediate": "Intermediate",
  "vocab.advanced": "Advanced",
  "vocab.expert": "Expert",
  "vocab.add": "Add",
  "vocab.added": "Added",
  "vocab.myWords": "My Words",
  "vocab.studySelected": "Study selected words",
  "vocab.tapToSelect": "Tap words to include them",
  "vocab.selectAll": "Select all",
  "vocab.clearSel": "Clear",
  "vocab.bankEmpty": "No words available yet. Please try again.",
  "vocab.bankError": "Couldn’t load the word bank. Pull to retry.",
  "vocab.studyTitle": "Study",
  "vocab.studySub": "{n} words to learn",
  "vocab.studyEmpty": "No words picked yet",
  "vocab.studyEmptySub": "Pick some {lang} words from the Word Bank to start studying.",
  "vocab.openBank": "Open Word Bank",
  "vocab.tapHear": "Tap to hear",
  "vocab.example": "Example",
  "vocab.showExample": "Show an example sentence",
  "vocab.loadingExample": "Writing an example…",
  "vocab.yourTurn": "Now you try — write a sentence using this word",
  "vocab.inputPlaceholder": "Type a sentence with “{word}”…",
  "vocab.check": "Check my sentence",
  "vocab.checking": "Checking…",
  "vocab.speak": "Speak your sentence",
  "vocab.recording": "Tap to stop",
  "vocab.transcribing": "Transcribing…",
  "vocab.scriptHint": "Typing in {lang} needs that keyboard added to your device — or just tap the mic and speak.",
  "vocab.correct": "Great job!",
  "vocab.needsWork": "Almost there",
  "vocab.correction": "Better:",
  "vocab.tryAgain": "Try again",
  "vocab.next": "Next word",
  "vocab.progress": "{current} of {total}",
  "vocab.remove": "Remove",
  "vocab.done": "All done!",
  "vocab.doneSub": "You studied all your picked words.",
  "vocab.restart": "Start over",
  "vocab.actionError": "Something went wrong. Please try again.",
  "sentences.title": "Simple Sentences",
  "sentences.sub": "Everyday {lang} phrases to get you around",
  "sentences.error": "Couldn’t load phrases. Pull to retry.",
  "sentences.empty": "No phrases available yet. Please try again.",
  "sentences.greetings": "Greetings",
  "sentences.basics": "Essentials",
  "sentences.directions": "Directions",
  "sentences.dining": "Eating Out",
  "sentences.shopping": "Shopping",
  "sentences.emergency": "Emergencies",
  "home.greeting": "Hello, {name}!",
  "home.subtitleLine1": "Scan something around you",
  "home.subtitleLine2": "and start a real conversation.",
  "home.dayStreak": "Day streak",
  "home.dailyStreak": "Daily Streak",
  "home.bestStreak": "Best Streak",
  "home.alphabet": "Alphabet",
  "home.alphabetDesc": "Learn the {lang} letters",
  "home.letters": "{n} letters",
  "alphabet.title": "{lang} Alphabet",
  "alphabet.tapToHear": "Tap to hear",
  "alphabet.example": "Example",
  "alphabet.progress": "{current} of {total}",
  "alphabet.previous": "Previous",
  "alphabet.next": "Next",
  "alphabet.complete": "Great job!",
  "alphabet.completeBody": "You\u2019ve gone through the whole {lang} alphabet.",
  "alphabet.startOver": "Start over",
  "home.aiChats": "AI Chat History",
  "home.sessions": "{n} sessions",
  "home.vocabulary": "Vocabulary",
  "home.vocabTag": "WORD BANK",
  "home.pathVocabSub": "Save \u00b7 Review \u00b7 Master",
  "home.pathVocabCta": "Open Word Bank",
  "home.words": "{n} words",
  "home.dailyGoal": "Daily Goal",
  "home.dailyProgress": "{done} / {goal} today",
  "home.challenges": "Challenges",
  "home.earnBadges": "Earn badges",
  "home.pathAlphabetTag": "ALPHABET",
  "home.pathAlphabetTitle": "Learn the ABC's",
  "home.pathAlphabetSub": "Letters \u00b7 Sounds \u00b7 Reading",
  "home.pathAlphabetCta": "Start Learning",
  "home.alphabetMastered": "Alphabet mastered",
  "home.alphabetMasteredSub": "Tap to review anytime",
  "home.alphabetReview": "Review",
  "home.alphabetProgress": "{done} / {total} mastered",
  "home.alphabetHide": "Hide",
  "home.pathSentencesTag": "PHRASES",
  "home.pathSentencesTitle": "Simple Sentences",
  "home.pathSentencesSub": "Greet \u00b7 Ask \u00b7 Get Around",
  "home.pathSentencesCta": "Learn Phrases",
  "home.pathChatTag": "AI POWERED",
  "home.pathChatTitle": "Full Conversation",
  "home.pathChatSub": "Talk freely with your AI tutor",
  "home.pathChatCta": "Start Chatting",
  "home.chatErrorTitle": "Couldn't start chat",
  "home.chatErrorBody": "Something went wrong starting your conversation. Please try again.",
  "home.continueConvos": "Continue your conversations",
  "home.newHere": "New here?",
  "home.newHereDesc": "Take a quick tour of what you can do",
  "home.takeTour": "Tour",
  "onboarding.skip": "Skip",
  "onboarding.next": "Next",
  "onboarding.getStarted": "Get Started",
  "onboarding.scanTitle": "Scan Anything",
  "onboarding.scanDesc": "Point your camera at any object and the AI instantly identifies it and translates it into the language you're learning.",
  "onboarding.chatTitle": "Chat with an AI Tutor",
  "onboarding.chatDesc": "Jump into a real conversation about what you scanned. Your tutor replies in your target language and gently corrects you.",
  "onboarding.abcTitle": "Master the Alphabet",
  "onboarding.abcDesc": "Learn the letters and sounds of your new language with bite-sized, interactive alphabet lessons.",
  "onboarding.sentencesTitle": "Speak in Sentences",
  "onboarding.sentencesDesc": "Pick up everyday phrases to greet people, ask questions, and get around — ready for real conversations.",
  "home.scanTag": "SCAN",
  "home.scanCta": "Scan Object",
  "home.practicing": "Practicing {lang}",
  "home.continueBtn": "Continue",
  "home.tapToContinue": "Tap to continue",
  "home.scanLearnSpeak": "Scan. Learn. Speak.",
  "home.heroDesc": "Point your camera and start learning",
  "tabs.home": "Home",
  "tabs.history": "History",
  "tabs.scan": "Scan",
  "settings.title": "Settings",
  "settings.learning": "Learning",
  "settings.iSpeak": "I speak",
  "settings.learningSub": "Learning {lang}",
  "settings.languages": "LANGUAGES",
  "settings.preferences": "PREFERENCES",
  "settings.about": "ABOUT",
  "settings.haptics": "Haptic feedback",
  "settings.hapticsSub": "Vibrate on actions",
  "settings.daily": "Daily reminder",
  "settings.dailySub": "Practice every day",
  "settings.help": "Help & support",
  "settings.version": "Version",
  "settings.chooseLearning": "Choose a language to learn",
  "settings.chooseNative": "Choose your language",
  "settings.helpAlertTitle": "Help",
  "settings.helpAlertBody": "Send us a note at hello@linguascan.app",
  "settings.sameLangTitle": "Same language?",
  "settings.sameLangBody": "You picked {lang} as both the language you speak and the one you\u2019re learning. You probably won\u2019t learn much that way.",
  "settings.continueAnyway": "Use it anyway",
  "settings.nativeComingSoonTitle": "Coming soon",
  "settings.nativeComingSoonBody": "More native languages are coming soon. For now, LinguaScan is set up for English speakers.",
  "settings.activity": "ACTIVITY",
  "settings.dailyGoalSub": "Track your daily learning goal",
  "settings.challengesSub": "Earn badges as you learn",
  "vocab.title": "Vocabulary",
  "vocab.all": "All",
  "vocab.empty": "No words yet",
  "vocab.emptySub": "Scan an object and start a conversation to build your vocabulary.",
  "vocab.unique": "{n} unique words",
  "vocab.from": "from \u201C{title}\u201D",
  "vocab.practice": "Practice",
  "practice.title": "Practice",
  "practice.listen": "Listen and say it out loud",
  "practice.tapHear": "Tap to hear again",
  "practice.showWord": "Show word",
  "practice.gotIt": "Got it",
  "practice.again": "Practice again",
  "practice.progress": "{current} of {total}",
  "practice.from": "from \u201C{title}\u201D",
  "practice.doneTitle": "Session complete!",
  "practice.doneBody": "You knew {known} of {total} words.",
  "practice.restart": "Practice again",
  "practice.close": "Done",
  "practice.empty": "No words to practice yet",
  "practice.emptySub": "Chat about scanned objects in {lang} to collect words, then come back to practice.",
  "progress.title": "Daily Progress",
  "progress.today": "TODAY",
  "progress.complete": "Goal complete. Nice work!",
  "progress.more": "{n} more to hit your goal",
  "progress.activeDays": "Active days",
  "progress.last7": "Last 7 days",
  "challenges.title": "Challenges",
  "challenges.earned": "BADGES EARNED",
  "challenges.keepGoing": "Keep scanning and chatting to unlock more.",
  "challenges.earnedTag": "Earned",
  "history.title": "History",
  "history.deleteTitle": "Delete conversation?",
  "history.deleteBody": "Remove \u201C{name}\u201D from history?",
  "history.cancel": "Cancel",
  "history.delete": "Delete",
  "history.empty": "No conversations yet",
  "history.emptySub": "Your past chats will show up here",
  "scan.captureFailedTitle": "Capture failed",
  "scan.captureFailedBody": "Could not take photo. Try again.",
  "scan.scanFailedTitle": "Scan failed",
  "scan.scanFailedBody": "Could not identify the item. Please try again.",
  "scan.identified": "Identified",
  "scan.tutorSays": "Tutor says",
  "scan.startConversation": "Start Conversation",
  "scan.scanAnother": "Scan something else",
  "scan.cameraUnavailableWeb": "Camera preview unavailable on web",
  "scan.cameraNeeded": "Camera access needed",
  "scan.enableCamera": "Enable Camera",
  "scan.identifying": "Identifying\u2026",
  "scan.history": "History",
  "scan.gallery": "Gallery",
  "scan.chooseLanguage": "Choose a language",
  "scan.hint": "Point your camera at anything to learn it",
  "scan.title": "Scan any item",
  "conv.placeholder": "Tap to speak or type\u2026",
  "conv.title": "Conversation",
  "conv.about": "About: {name}",
  "conv.errorReply": "Sorry, something went wrong. Please try again.",
  "conv.fallbackName": "Conversation",
  "conv.micDeniedTitle": "Microphone access needed",
  "conv.micDeniedBody": "Please allow microphone access to speak with your tutor.",
  "conv.micErrorTitle": "Recording problem",
  "conv.micErrorBody": "Could not start recording. Please try again.",
  "conv.transcribeErrorTitle": "Couldn\u2019t hear that",
  "conv.transcribeErrorBody": "Sorry, we couldn\u2019t understand the audio. Please try again.",
  "conv.transcribeEmptyTitle": "Didn\u2019t catch anything",
  "conv.transcribeEmptyBody": "We didn\u2019t hear any speech. Try speaking a little longer and closer to the mic.",
  "conv.listening": "Listening\u2026",
  "conv.micTooLongTitle": "Recording too long",
  "conv.micTooLongBody": "That recording is too long. Please try a shorter message.",
  "conv.grade": "Grade conversation",
  "conv.grading": "Grading\u2026",
  "conv.gradeTitle": "Your score",
  "conv.gradePromptTitle": "Grade your conversation",
  "conv.gradePromptBody": "Get a score out of 100 plus tips on what you did well and what to improve.",
  "conv.gradeNow": "Grade now",
  "conv.gradeAgain": "Grade again",
  "conv.gradeScore": "out of 100",
  "conv.gradeStrengths": "Strengths",
  "conv.gradeMistakes": "Corrections",
  "conv.gradeNoMistakes": "No mistakes spotted \u2014 great job!",
  "conv.gradeSuggestions": "Suggestions",
  "conv.gradeClose": "Close",
  "conv.gradedOn": "Graded {date}",
  "conv.gradeTooFewTitle": "Keep chatting",
  "conv.gradeTooFewBody": "Chat a bit more before grading \u2014 send a couple of messages first.",
  "conv.gradeErrorTitle": "Grading failed",
  "conv.gradeErrorBody": "Sorry, we couldn\u2019t grade this chat. Please try again.",
  "conv.translate": "Translate",
  "conv.translating": "Translating\u2026",
  "conv.hideTranslation": "Hide translation",
  "conv.translateError": "Couldn\u2019t translate that. Please try again.",
  "settings.difficulty": "Difficulty",
  "settings.chooseDifficulty": "Choose difficulty",
  "difficulty.Beginner": "Beginner",
  "difficulty.Intermediate": "Intermediate",
  "difficulty.Advanced": "Advanced",
  "difficulty.BeginnerDesc": "Simple words, lots of translations, gentle corrections",
  "difficulty.IntermediateDesc": "Everyday language with clear corrections",
  "difficulty.AdvancedDesc": "Native-level, few translations, rigorous corrections",
  "scan.chooseLevel": "Choose difficulty",
  "history.today": "Today",
  "history.yesterday": "Yesterday",
  "history.daysAgo": "{n} days ago",
  "history.lockedTitle": "Switch language to continue",
  "history.lockedBody":
    "This chat is in {lang}, but you're currently learning {current}. Switch your learning language to {lang} to open it.",
  "history.switchAndOpen": "Switch to {lang}",
  "history.keepCurrent": "Cancel",
  "history.currentLangTag": "Learning now",
  "badge.firstScan.title": "First Scan",
  "badge.firstScan.desc": "Complete your first scan",
  "badge.chatty.title": "Chatty",
  "badge.chatty.desc": "Have 5 conversations",
  "badge.wordHoarder.title": "Word Hoarder",
  "badge.wordHoarder.desc": "Collect 50 unique words",
  "badge.polyglot.title": "Polyglot",
  "badge.polyglot.desc": "Practice 3 different languages",
  "badge.consistent.title": "Consistent",
  "badge.consistent.desc": "Practice on 7 different days",
  "badge.century.title": "Century",
  "badge.century.desc": "Collect 100 unique words",
};

type Dict = Partial<Record<TKey, string>>;

const es: Dict = {
  "home.greeting": "¡Hola, {name}!",
  "home.subtitleLine1": "Escanea algo a tu alrededor",
  "home.subtitleLine2": "e inicia una conversación real.",
  "home.dayStreak": "Días seguidos",
  "home.aiChats": "Chats con IA",
  "home.sessions": "{n} sesiones",
  "home.vocabulary": "Vocabulario",
  "home.words": "{n} palabras",
  "home.dailyGoal": "Meta diaria",
  "home.dailyProgress": "{done} / {goal} hoy",
  "home.challenges": "Retos",
  "home.earnBadges": "Gana insignias",
  "home.continueConvos": "Continúa tus conversaciones",
  "home.newHere": "¿Eres nuevo?",
  "home.newHereDesc": "Toma tu primera foto para empezar",
  "home.scanCta": "Escanear",
  "home.practicing": "Practicando {lang}",
  "home.continueBtn": "Continuar",
  "home.tapToContinue": "Toca para continuar",
  "home.scanLearnSpeak": "Escanea. Aprende. Habla.",
  "home.heroDesc": "Apunta tu cámara y empieza a aprender",
  "tabs.home": "Inicio",
  "tabs.history": "Historial",
  "tabs.scan": "Escanear",
  "settings.title": "Ajustes",
  "settings.learning": "Aprendiendo",
  "settings.iSpeak": "Hablo",
  "settings.learningSub": "Aprendiendo {lang}",
  "settings.languages": "IDIOMAS",
  "settings.preferences": "PREFERENCIAS",
  "settings.about": "ACERCA DE",
  "settings.haptics": "Vibración",
  "settings.hapticsSub": "Vibrar al tocar",
  "settings.daily": "Recordatorio diario",
  "settings.dailySub": "Practica cada día",
  "settings.help": "Ayuda y soporte",
  "settings.version": "Versión",
  "settings.chooseLearning": "Elige un idioma para aprender",
  "settings.chooseNative": "Elige tu idioma",
  "settings.helpAlertTitle": "Ayuda",
  "settings.helpAlertBody": "Escríbenos a hello@linguascan.app",
  "vocab.title": "Vocabulario",
  "vocab.all": "Todos",
  "vocab.empty": "Aún no hay palabras",
  "vocab.emptySub": "Escanea un objeto y empieza una conversación para crear tu vocabulario.",
  "vocab.unique": "{n} palabras únicas",
  "vocab.from": "de \u201C{title}\u201D",
  "progress.title": "Progreso diario",
  "progress.today": "HOY",
  "progress.complete": "¡Meta cumplida! Bien hecho.",
  "progress.more": "{n} más para llegar a tu meta",
  "progress.activeDays": "Días activos",
  "progress.last7": "Últimos 7 días",
  "challenges.title": "Retos",
  "challenges.earned": "INSIGNIAS GANADAS",
  "challenges.keepGoing": "Sigue escaneando y conversando para desbloquear más.",
  "challenges.earnedTag": "Ganada",
  "history.title": "Historial",
  "history.deleteTitle": "¿Eliminar conversación?",
  "history.deleteBody": "¿Quitar \u201C{name}\u201D del historial?",
  "history.cancel": "Cancelar",
  "history.delete": "Eliminar",
  "history.empty": "Aún no hay conversaciones",
  "history.emptySub": "Tus chats anteriores aparecerán aquí",
  "scan.captureFailedTitle": "Captura fallida",
  "scan.captureFailedBody": "No se pudo tomar la foto. Inténtalo de nuevo.",
  "scan.scanFailedTitle": "Escaneo fallido",
  "scan.scanFailedBody": "No se pudo identificar el objeto. Inténtalo de nuevo.",
  "conv.placeholder": "Toca para hablar o escribe\u2026",
  "badge.firstScan.title": "Primer Escaneo",
  "badge.firstScan.desc": "Completa tu primer escaneo",
  "badge.chatty.title": "Charlatán",
  "badge.chatty.desc": "Ten 5 conversaciones",
  "badge.wordHoarder.title": "Coleccionista",
  "badge.wordHoarder.desc": "Recolecta 50 palabras únicas",
  "badge.polyglot.title": "Políglota",
  "badge.polyglot.desc": "Practica 3 idiomas diferentes",
  "badge.consistent.title": "Constante",
  "badge.consistent.desc": "Practica 7 días distintos",
  "badge.century.title": "Centenario",
  "badge.century.desc": "Recolecta 100 palabras únicas",
};

const fr: Dict = {
  "home.greeting": "Bonjour, {name} !",
  "home.subtitleLine1": "Scannez quelque chose autour de vous",
  "home.subtitleLine2": "et commencez une vraie conversation.",
  "home.dayStreak": "Jours d\u2019affilée",
  "home.aiChats": "Discussions IA",
  "home.sessions": "{n} sessions",
  "home.vocabulary": "Vocabulaire",
  "home.words": "{n} mots",
  "home.dailyGoal": "Objectif du jour",
  "home.dailyProgress": "{done} / {goal} aujourd\u2019hui",
  "home.challenges": "Défis",
  "home.earnBadges": "Gagnez des badges",
  "home.continueConvos": "Continuez vos conversations",
  "home.newHere": "Nouveau ici ?",
  "home.newHereDesc": "Prenez votre première photo pour commencer",
  "home.scanCta": "Scanner",
  "home.practicing": "Pratique du {lang}",
  "home.continueBtn": "Continuer",
  "home.tapToContinue": "Touchez pour continuer",
  "home.scanLearnSpeak": "Scannez. Apprenez. Parlez.",
  "home.heroDesc": "Pointez votre caméra et apprenez",
  "tabs.home": "Accueil",
  "tabs.history": "Historique",
  "tabs.scan": "Scanner",
  "settings.title": "Réglages",
  "settings.learning": "J\u2019apprends",
  "settings.iSpeak": "Je parle",
  "settings.learningSub": "J\u2019apprends le {lang}",
  "settings.languages": "LANGUES",
  "settings.preferences": "PRÉFÉRENCES",
  "settings.about": "À PROPOS",
  "settings.haptics": "Retour haptique",
  "settings.hapticsSub": "Vibrer lors des actions",
  "settings.daily": "Rappel quotidien",
  "settings.dailySub": "Pratiquez chaque jour",
  "settings.help": "Aide et support",
  "settings.version": "Version",
  "settings.chooseLearning": "Choisissez une langue à apprendre",
  "settings.chooseNative": "Choisissez votre langue",
  "settings.helpAlertTitle": "Aide",
  "settings.helpAlertBody": "Écrivez-nous à hello@linguascan.app",
  "vocab.title": "Vocabulaire",
  "vocab.all": "Tous",
  "vocab.empty": "Aucun mot pour l\u2019instant",
  "vocab.emptySub": "Scannez un objet et discutez pour enrichir votre vocabulaire.",
  "vocab.unique": "{n} mots uniques",
  "vocab.from": "de « {title} »",
  "progress.title": "Progrès quotidien",
  "progress.today": "AUJOURD\u2019HUI",
  "progress.complete": "Objectif atteint. Bravo !",
  "progress.more": "Encore {n} pour atteindre votre objectif",
  "progress.activeDays": "Jours actifs",
  "progress.last7": "7 derniers jours",
  "challenges.title": "Défis",
  "challenges.earned": "BADGES OBTENUS",
  "challenges.keepGoing": "Continuez à scanner et discuter pour en débloquer plus.",
  "challenges.earnedTag": "Obtenu",
  "history.title": "Historique",
  "history.deleteTitle": "Supprimer la conversation ?",
  "history.deleteBody": "Retirer « {name} » de l\u2019historique ?",
  "history.cancel": "Annuler",
  "history.delete": "Supprimer",
  "history.empty": "Pas encore de conversations",
  "history.emptySub": "Vos discussions passées apparaîtront ici",
  "scan.captureFailedTitle": "Échec de la capture",
  "scan.captureFailedBody": "Impossible de prendre la photo. Réessayez.",
  "scan.scanFailedTitle": "Échec du scan",
  "scan.scanFailedBody": "Impossible d\u2019identifier l\u2019objet. Réessayez.",
  "conv.placeholder": "Touchez pour parler ou écrire\u2026",
  "badge.firstScan.title": "Premier scan",
  "badge.firstScan.desc": "Réalisez votre premier scan",
  "badge.chatty.title": "Bavard",
  "badge.chatty.desc": "Tenez 5 conversations",
  "badge.wordHoarder.title": "Collectionneur",
  "badge.wordHoarder.desc": "Collectez 50 mots uniques",
  "badge.polyglot.title": "Polyglotte",
  "badge.polyglot.desc": "Pratiquez 3 langues différentes",
  "badge.consistent.title": "Régulier",
  "badge.consistent.desc": "Pratiquez sur 7 jours différents",
  "badge.century.title": "Centenaire",
  "badge.century.desc": "Collectez 100 mots uniques",
};

const de: Dict = {
  "home.greeting": "Hallo, {name}!",
  "home.subtitleLine1": "Scanne etwas in deiner Umgebung",
  "home.subtitleLine2": "und starte ein echtes Gespräch.",
  "home.dayStreak": "Tage in Folge",
  "home.aiChats": "KI-Chats",
  "home.sessions": "{n} Sitzungen",
  "home.vocabulary": "Wortschatz",
  "home.words": "{n} Wörter",
  "home.dailyGoal": "Tagesziel",
  "home.dailyProgress": "{done} / {goal} heute",
  "home.challenges": "Herausforderungen",
  "home.earnBadges": "Abzeichen verdienen",
  "home.continueConvos": "Setze deine Gespräche fort",
  "home.newHere": "Neu hier?",
  "home.newHereDesc": "Mach dein erstes Foto, um zu starten",
  "home.scanCta": "Scannen",
  "home.practicing": "Du übst {lang}",
  "home.continueBtn": "Weiter",
  "home.tapToContinue": "Tippen zum Fortsetzen",
  "home.scanLearnSpeak": "Scannen. Lernen. Sprechen.",
  "home.heroDesc": "Richte die Kamera und lerne",
  "tabs.home": "Start",
  "tabs.history": "Verlauf",
  "tabs.scan": "Scannen",
  "settings.title": "Einstellungen",
  "settings.learning": "Lernsprache",
  "settings.iSpeak": "Ich spreche",
  "settings.learningSub": "Du lernst {lang}",
  "settings.languages": "SPRACHEN",
  "settings.preferences": "EINSTELLUNGEN",
  "settings.about": "ÜBER",
  "settings.haptics": "Haptisches Feedback",
  "settings.hapticsSub": "Vibration bei Aktionen",
  "settings.daily": "Tägliche Erinnerung",
  "settings.dailySub": "Übe jeden Tag",
  "settings.help": "Hilfe & Support",
  "settings.version": "Version",
  "settings.chooseLearning": "Wähle eine Sprache zum Lernen",
  "settings.chooseNative": "Wähle deine Sprache",
  "settings.helpAlertTitle": "Hilfe",
  "settings.helpAlertBody": "Schreib uns an hello@linguascan.app",
  "vocab.title": "Wortschatz",
  "vocab.all": "Alle",
  "vocab.empty": "Noch keine Wörter",
  "vocab.emptySub": "Scanne ein Objekt und starte ein Gespräch, um Wörter zu sammeln.",
  "vocab.unique": "{n} einzigartige Wörter",
  "vocab.from": "aus \u201E{title}\u201C",
  "progress.title": "Tagesfortschritt",
  "progress.today": "HEUTE",
  "progress.complete": "Ziel erreicht. Gut gemacht!",
  "progress.more": "Noch {n}, um dein Ziel zu erreichen",
  "progress.activeDays": "Aktive Tage",
  "progress.last7": "Letzte 7 Tage",
  "challenges.title": "Herausforderungen",
  "challenges.earned": "ABZEICHEN VERDIENT",
  "challenges.keepGoing": "Scanne und chatte weiter, um mehr freizuschalten.",
  "challenges.earnedTag": "Erhalten",
  "history.title": "Verlauf",
  "history.deleteTitle": "Gespräch löschen?",
  "history.deleteBody": "\u201E{name}\u201C aus dem Verlauf entfernen?",
  "history.cancel": "Abbrechen",
  "history.delete": "Löschen",
  "history.empty": "Noch keine Gespräche",
  "history.emptySub": "Deine vergangenen Chats erscheinen hier",
  "scan.captureFailedTitle": "Aufnahme fehlgeschlagen",
  "scan.captureFailedBody": "Foto konnte nicht aufgenommen werden. Erneut versuchen.",
  "scan.scanFailedTitle": "Scan fehlgeschlagen",
  "scan.scanFailedBody": "Objekt konnte nicht erkannt werden. Bitte erneut versuchen.",
  "conv.placeholder": "Tippen zum Sprechen oder Schreiben\u2026",
  "badge.firstScan.title": "Erster Scan",
  "badge.firstScan.desc": "Mach deinen ersten Scan",
  "badge.chatty.title": "Plaudertasche",
  "badge.chatty.desc": "Führe 5 Gespräche",
  "badge.wordHoarder.title": "Wortsammler",
  "badge.wordHoarder.desc": "Sammle 50 einzigartige Wörter",
  "badge.polyglot.title": "Polyglott",
  "badge.polyglot.desc": "Übe 3 verschiedene Sprachen",
  "badge.consistent.title": "Beständig",
  "badge.consistent.desc": "Übe an 7 verschiedenen Tagen",
  "badge.century.title": "Jahrhundert",
  "badge.century.desc": "Sammle 100 einzigartige Wörter",
};

const it: Dict = {
  "home.greeting": "Ciao, {name}!",
  "home.subtitleLine1": "Scansiona qualcosa intorno a te",
  "home.subtitleLine2": "e inizia una vera conversazione.",
  "home.dayStreak": "Giorni di fila",
  "home.aiChats": "Chat IA",
  "home.sessions": "{n} sessioni",
  "home.vocabulary": "Vocabolario",
  "home.words": "{n} parole",
  "home.dailyGoal": "Obiettivo del giorno",
  "home.dailyProgress": "{done} / {goal} oggi",
  "home.challenges": "Sfide",
  "home.earnBadges": "Ottieni distintivi",
  "home.continueConvos": "Continua le tue conversazioni",
  "home.newHere": "Nuovo qui?",
  "home.newHereDesc": "Scatta la tua prima foto per iniziare",
  "home.scanCta": "Scansiona",
  "home.practicing": "Pratichi {lang}",
  "home.continueBtn": "Continua",
  "home.tapToContinue": "Tocca per continuare",
  "home.scanLearnSpeak": "Scansiona. Impara. Parla.",
  "home.heroDesc": "Punta la fotocamera e inizia a imparare",
  "tabs.home": "Home",
  "tabs.history": "Cronologia",
  "tabs.scan": "Scansiona",
  "settings.title": "Impostazioni",
  "settings.learning": "Sto imparando",
  "settings.iSpeak": "Parlo",
  "settings.learningSub": "Stai imparando {lang}",
  "settings.languages": "LINGUE",
  "settings.preferences": "PREFERENZE",
  "settings.about": "INFO",
  "settings.haptics": "Vibrazione",
  "settings.hapticsSub": "Vibra al tocco",
  "settings.daily": "Promemoria giornaliero",
  "settings.dailySub": "Esercitati ogni giorno",
  "settings.help": "Aiuto e supporto",
  "settings.version": "Versione",
  "settings.chooseLearning": "Scegli una lingua da imparare",
  "settings.chooseNative": "Scegli la tua lingua",
  "settings.helpAlertTitle": "Aiuto",
  "settings.helpAlertBody": "Scrivici a hello@linguascan.app",
  "vocab.title": "Vocabolario",
  "vocab.all": "Tutte",
  "vocab.empty": "Ancora nessuna parola",
  "vocab.emptySub": "Scansiona un oggetto e inizia una conversazione per costruire il tuo vocabolario.",
  "vocab.unique": "{n} parole uniche",
  "vocab.from": "da \u201C{title}\u201D",
  "progress.title": "Progresso giornaliero",
  "progress.today": "OGGI",
  "progress.complete": "Obiettivo completato. Ottimo!",
  "progress.more": "Ancora {n} per raggiungere l\u2019obiettivo",
  "progress.activeDays": "Giorni attivi",
  "progress.last7": "Ultimi 7 giorni",
  "challenges.title": "Sfide",
  "challenges.earned": "DISTINTIVI OTTENUTI",
  "challenges.keepGoing": "Continua a scansionare e chattare per sbloccarne altri.",
  "challenges.earnedTag": "Ottenuto",
  "history.title": "Cronologia",
  "history.deleteTitle": "Eliminare conversazione?",
  "history.deleteBody": "Rimuovere \u201C{name}\u201D dalla cronologia?",
  "history.cancel": "Annulla",
  "history.delete": "Elimina",
  "history.empty": "Ancora nessuna conversazione",
  "history.emptySub": "Le tue chat passate appariranno qui",
  "scan.captureFailedTitle": "Acquisizione fallita",
  "scan.captureFailedBody": "Impossibile scattare la foto. Riprova.",
  "scan.scanFailedTitle": "Scansione fallita",
  "scan.scanFailedBody": "Impossibile identificare l\u2019oggetto. Riprova.",
  "conv.placeholder": "Tocca per parlare o scrivere\u2026",
  "badge.firstScan.title": "Prima Scansione",
  "badge.firstScan.desc": "Completa la tua prima scansione",
  "badge.chatty.title": "Chiacchierone",
  "badge.chatty.desc": "Fai 5 conversazioni",
  "badge.wordHoarder.title": "Collezionista",
  "badge.wordHoarder.desc": "Raccogli 50 parole uniche",
  "badge.polyglot.title": "Poliglotta",
  "badge.polyglot.desc": "Pratica 3 lingue diverse",
  "badge.consistent.title": "Costante",
  "badge.consistent.desc": "Esercitati per 7 giorni diversi",
  "badge.century.title": "Centenario",
  "badge.century.desc": "Raccogli 100 parole uniche",
};

const pt: Dict = {
  "home.greeting": "Olá, {name}!",
  "home.subtitleLine1": "Escaneie algo ao seu redor",
  "home.subtitleLine2": "e comece uma conversa real.",
  "home.dayStreak": "Dias seguidos",
  "home.aiChats": "Chats com IA",
  "home.sessions": "{n} sessões",
  "home.vocabulary": "Vocabulário",
  "home.words": "{n} palavras",
  "home.dailyGoal": "Meta diária",
  "home.dailyProgress": "{done} / {goal} hoje",
  "home.challenges": "Desafios",
  "home.earnBadges": "Ganhe medalhas",
  "home.continueConvos": "Continue suas conversas",
  "home.newHere": "Novo por aqui?",
  "home.newHereDesc": "Tire sua primeira foto para começar",
  "home.scanCta": "Escanear",
  "home.practicing": "Praticando {lang}",
  "home.continueBtn": "Continuar",
  "home.tapToContinue": "Toque para continuar",
  "home.scanLearnSpeak": "Escaneie. Aprenda. Fale.",
  "home.heroDesc": "Aponte a câmera e comece a aprender",
  "tabs.home": "Início",
  "tabs.history": "Histórico",
  "tabs.scan": "Escanear",
  "settings.title": "Configurações",
  "settings.learning": "Aprendendo",
  "settings.iSpeak": "Eu falo",
  "settings.learningSub": "Aprendendo {lang}",
  "settings.languages": "IDIOMAS",
  "settings.preferences": "PREFERÊNCIAS",
  "settings.about": "SOBRE",
  "settings.haptics": "Vibração",
  "settings.hapticsSub": "Vibrar ao tocar",
  "settings.daily": "Lembrete diário",
  "settings.dailySub": "Pratique todo dia",
  "settings.help": "Ajuda e suporte",
  "settings.version": "Versão",
  "settings.chooseLearning": "Escolha um idioma para aprender",
  "settings.chooseNative": "Escolha seu idioma",
  "settings.helpAlertTitle": "Ajuda",
  "settings.helpAlertBody": "Escreva para hello@linguascan.app",
  "vocab.title": "Vocabulário",
  "vocab.all": "Todas",
  "vocab.empty": "Ainda sem palavras",
  "vocab.emptySub": "Escaneie um objeto e converse para criar seu vocabulário.",
  "vocab.unique": "{n} palavras únicas",
  "vocab.from": "de \u201C{title}\u201D",
  "progress.title": "Progresso diário",
  "progress.today": "HOJE",
  "progress.complete": "Meta concluída. Mandou bem!",
  "progress.more": "Faltam {n} para sua meta",
  "progress.activeDays": "Dias ativos",
  "progress.last7": "Últimos 7 dias",
  "challenges.title": "Desafios",
  "challenges.earned": "MEDALHAS GANHAS",
  "challenges.keepGoing": "Continue escaneando e conversando para desbloquear mais.",
  "challenges.earnedTag": "Conquistada",
  "history.title": "Histórico",
  "history.deleteTitle": "Excluir conversa?",
  "history.deleteBody": "Remover \u201C{name}\u201D do histórico?",
  "history.cancel": "Cancelar",
  "history.delete": "Excluir",
  "history.empty": "Ainda sem conversas",
  "history.emptySub": "Seus chats anteriores aparecerão aqui",
  "scan.captureFailedTitle": "Falha ao capturar",
  "scan.captureFailedBody": "Não foi possível tirar a foto. Tente novamente.",
  "scan.scanFailedTitle": "Falha no escaneamento",
  "scan.scanFailedBody": "Não foi possível identificar o objeto. Tente novamente.",
  "conv.placeholder": "Toque para falar ou digite\u2026",
  "badge.firstScan.title": "Primeiro Escaneamento",
  "badge.firstScan.desc": "Faça seu primeiro escaneamento",
  "badge.chatty.title": "Tagarela",
  "badge.chatty.desc": "Tenha 5 conversas",
  "badge.wordHoarder.title": "Colecionador",
  "badge.wordHoarder.desc": "Reúna 50 palavras únicas",
  "badge.polyglot.title": "Poliglota",
  "badge.polyglot.desc": "Pratique 3 idiomas diferentes",
  "badge.consistent.title": "Consistente",
  "badge.consistent.desc": "Pratique em 7 dias diferentes",
  "badge.century.title": "Centenário",
  "badge.century.desc": "Reúna 100 palavras únicas",
};

const ja: Dict = {
  "home.greeting": "こんにちは、{name}さん！",
  "home.subtitleLine1": "身の回りのものをスキャンして",
  "home.subtitleLine2": "本物の会話を始めましょう。",
  "home.dayStreak": "連続日数",
  "home.aiChats": "AIチャット",
  "home.sessions": "{n}セッション",
  "home.vocabulary": "ボキャブラリー",
  "home.words": "{n}単語",
  "home.dailyGoal": "今日の目標",
  "home.dailyProgress": "今日 {done} / {goal}",
  "home.challenges": "チャレンジ",
  "home.earnBadges": "バッジを獲得",
  "home.continueConvos": "会話の続きを再開",
  "home.newHere": "はじめてですか？",
  "home.newHereDesc": "最初の写真を撮って始めましょう",
  "home.scanCta": "スキャン",
  "home.practicing": "{lang}を練習中",
  "home.continueBtn": "続ける",
  "home.tapToContinue": "タップして続ける",
  "home.scanLearnSpeak": "スキャン。学ぶ。話す。",
  "home.heroDesc": "カメラを向けて学習を始めよう",
  "tabs.home": "ホーム",
  "tabs.history": "履歴",
  "tabs.scan": "スキャン",
  "settings.title": "設定",
  "settings.learning": "学習中",
  "settings.iSpeak": "母語",
  "settings.learningSub": "{lang}を学習中",
  "settings.languages": "言語",
  "settings.preferences": "環境設定",
  "settings.about": "アプリについて",
  "settings.haptics": "触覚フィードバック",
  "settings.hapticsSub": "操作時に振動",
  "settings.daily": "毎日のリマインダー",
  "settings.dailySub": "毎日練習しましょう",
  "settings.help": "ヘルプとサポート",
  "settings.version": "バージョン",
  "settings.chooseLearning": "学ぶ言語を選ぶ",
  "settings.chooseNative": "母語を選ぶ",
  "settings.helpAlertTitle": "ヘルプ",
  "settings.helpAlertBody": "hello@linguascan.app までご連絡ください",
  "vocab.title": "ボキャブラリー",
  "vocab.all": "すべて",
  "vocab.empty": "まだ単語がありません",
  "vocab.emptySub": "物をスキャンして会話を始めると、ボキャブラリーが増えていきます。",
  "vocab.unique": "{n}個のユニーク単語",
  "vocab.from": "「{title}」より",
  "progress.title": "今日の進捗",
  "progress.today": "今日",
  "progress.complete": "目標達成！お見事です。",
  "progress.more": "あと{n}で目標達成",
  "progress.activeDays": "アクティブな日数",
  "progress.last7": "直近7日間",
  "challenges.title": "チャレンジ",
  "challenges.earned": "獲得したバッジ",
  "challenges.keepGoing": "スキャンとチャットを続けて、もっと解放しましょう。",
  "challenges.earnedTag": "獲得済み",
  "history.title": "履歴",
  "history.deleteTitle": "会話を削除しますか？",
  "history.deleteBody": "履歴から「{name}」を削除しますか？",
  "history.cancel": "キャンセル",
  "history.delete": "削除",
  "history.empty": "まだ会話がありません",
  "history.emptySub": "過去のチャットがここに表示されます",
  "scan.captureFailedTitle": "撮影に失敗",
  "scan.captureFailedBody": "写真を撮れませんでした。もう一度お試しください。",
  "scan.scanFailedTitle": "スキャン失敗",
  "scan.scanFailedBody": "物体を識別できませんでした。もう一度お試しください。",
  "conv.placeholder": "タップして話すか入力\u2026",
  "badge.firstScan.title": "はじめてのスキャン",
  "badge.firstScan.desc": "最初のスキャンを完了する",
  "badge.chatty.title": "おしゃべり",
  "badge.chatty.desc": "5回の会話を行う",
  "badge.wordHoarder.title": "単語コレクター",
  "badge.wordHoarder.desc": "50のユニーク単語を集める",
  "badge.polyglot.title": "ポリグロット",
  "badge.polyglot.desc": "3つの異なる言語を練習する",
  "badge.consistent.title": "コツコツ派",
  "badge.consistent.desc": "7日間練習する",
  "badge.century.title": "センチュリー",
  "badge.century.desc": "100のユニーク単語を集める",
};

const zh: Dict = {
  "home.greeting": "你好，{name}！",
  "home.subtitleLine1": "扫描你身边的物品",
  "home.subtitleLine2": "开始一段真实对话。",
  "home.dayStreak": "连续天数",
  "home.aiChats": "AI 聊天",
  "home.sessions": "{n} 次",
  "home.vocabulary": "词汇",
  "home.words": "{n} 个单词",
  "home.dailyGoal": "每日目标",
  "home.dailyProgress": "今天 {done} / {goal}",
  "home.challenges": "挑战",
  "home.earnBadges": "赢取徽章",
  "home.continueConvos": "继续你的对话",
  "home.newHere": "第一次来？",
  "home.newHereDesc": "拍下你的第一张照片开始吧",
  "home.scanCta": "扫描",
  "home.practicing": "正在练习{lang}",
  "home.continueBtn": "继续",
  "home.tapToContinue": "点击继续",
  "home.scanLearnSpeak": "扫描。学习。开口说。",
  "home.heroDesc": "对准相机，开始学习",
  "tabs.home": "首页",
  "tabs.history": "历史",
  "tabs.scan": "扫描",
  "settings.title": "设置",
  "settings.learning": "正在学习",
  "settings.iSpeak": "我说",
  "settings.learningSub": "正在学习{lang}",
  "settings.languages": "语言",
  "settings.preferences": "偏好",
  "settings.about": "关于",
  "settings.haptics": "触感反馈",
  "settings.hapticsSub": "操作时震动",
  "settings.daily": "每日提醒",
  "settings.dailySub": "每天练习",
  "settings.help": "帮助和支持",
  "settings.version": "版本",
  "settings.chooseLearning": "选择要学习的语言",
  "settings.chooseNative": "选择你的语言",
  "settings.helpAlertTitle": "帮助",
  "settings.helpAlertBody": "请发邮件到 hello@linguascan.app",
  "vocab.title": "词汇",
  "vocab.all": "全部",
  "vocab.empty": "还没有单词",
  "vocab.emptySub": "扫描物体并开始对话来建立你的词汇库。",
  "vocab.unique": "{n} 个独特单词",
  "vocab.from": "来自「{title}」",
  "progress.title": "今日进度",
  "progress.today": "今天",
  "progress.complete": "目标完成。干得好！",
  "progress.more": "再{n}个就达成目标",
  "progress.activeDays": "活跃天数",
  "progress.last7": "最近 7 天",
  "challenges.title": "挑战",
  "challenges.earned": "已获得徽章",
  "challenges.keepGoing": "继续扫描和聊天，解锁更多。",
  "challenges.earnedTag": "已获得",
  "history.title": "历史",
  "history.deleteTitle": "删除对话？",
  "history.deleteBody": "从历史中移除「{name}」？",
  "history.cancel": "取消",
  "history.delete": "删除",
  "history.empty": "还没有对话",
  "history.emptySub": "你过去的聊天会显示在这里",
  "scan.captureFailedTitle": "拍摄失败",
  "scan.captureFailedBody": "无法拍照，请重试。",
  "scan.scanFailedTitle": "扫描失败",
  "scan.scanFailedBody": "无法识别物体，请重试。",
  "conv.placeholder": "点击说话或输入\u2026",
  "badge.firstScan.title": "首次扫描",
  "badge.firstScan.desc": "完成第一次扫描",
  "badge.chatty.title": "健谈",
  "badge.chatty.desc": "进行 5 次对话",
  "badge.wordHoarder.title": "单词收藏家",
  "badge.wordHoarder.desc": "收集 50 个独特单词",
  "badge.polyglot.title": "多语者",
  "badge.polyglot.desc": "练习 3 种不同语言",
  "badge.consistent.title": "持之以恒",
  "badge.consistent.desc": "在 7 天里练习",
  "badge.century.title": "百词达人",
  "badge.century.desc": "收集 100 个独特单词",
};

const ko: Dict = {
  "home.greeting": "안녕하세요, {name}님!",
  "home.subtitleLine1": "주변의 사물을 스캔하고",
  "home.subtitleLine2": "진짜 대화를 시작하세요.",
  "home.dayStreak": "연속 일수",
  "home.aiChats": "AI 채팅",
  "home.sessions": "{n}회",
  "home.vocabulary": "어휘",
  "home.words": "{n} 단어",
  "home.dailyGoal": "오늘의 목표",
  "home.dailyProgress": "오늘 {done} / {goal}",
  "home.challenges": "도전",
  "home.earnBadges": "배지 획득",
  "home.continueConvos": "대화 이어가기",
  "home.newHere": "처음이신가요?",
  "home.newHereDesc": "첫 사진을 찍고 시작하세요",
  "home.scanCta": "스캔",
  "home.practicing": "{lang} 연습 중",
  "home.continueBtn": "계속",
  "home.tapToContinue": "탭하여 계속",
  "home.scanLearnSpeak": "스캔. 학습. 말하기.",
  "home.heroDesc": "카메라를 향해 학습을 시작하세요",
  "tabs.home": "홈",
  "tabs.history": "기록",
  "tabs.scan": "스캔",
  "settings.title": "설정",
  "settings.learning": "학습 중",
  "settings.iSpeak": "내 언어",
  "settings.learningSub": "{lang} 학습 중",
  "settings.languages": "언어",
  "settings.preferences": "환경설정",
  "settings.about": "정보",
  "settings.haptics": "햅틱 피드백",
  "settings.hapticsSub": "동작 시 진동",
  "settings.daily": "매일 알림",
  "settings.dailySub": "매일 연습하기",
  "settings.help": "도움말 및 지원",
  "settings.version": "버전",
  "settings.chooseLearning": "학습할 언어 선택",
  "settings.chooseNative": "내 언어 선택",
  "settings.helpAlertTitle": "도움말",
  "settings.helpAlertBody": "hello@linguascan.app 으로 연락 주세요",
  "vocab.title": "어휘",
  "vocab.all": "전체",
  "vocab.empty": "아직 단어가 없어요",
  "vocab.emptySub": "사물을 스캔하고 대화하면서 어휘를 쌓아보세요.",
  "vocab.unique": "고유 단어 {n}개",
  "vocab.from": "「{title}」에서",
  "progress.title": "오늘의 진행",
  "progress.today": "오늘",
  "progress.complete": "목표 달성! 잘하셨어요.",
  "progress.more": "목표까지 {n} 남음",
  "progress.activeDays": "활동한 날",
  "progress.last7": "최근 7일",
  "challenges.title": "도전",
  "challenges.earned": "획득한 배지",
  "challenges.keepGoing": "계속 스캔하고 대화해서 더 많은 배지를 잠금 해제하세요.",
  "challenges.earnedTag": "획득",
  "history.title": "기록",
  "history.deleteTitle": "대화를 삭제할까요?",
  "history.deleteBody": "기록에서 「{name}」 을(를) 제거할까요?",
  "history.cancel": "취소",
  "history.delete": "삭제",
  "history.empty": "아직 대화가 없어요",
  "history.emptySub": "지난 채팅이 여기에 표시됩니다",
  "scan.captureFailedTitle": "촬영 실패",
  "scan.captureFailedBody": "사진을 찍을 수 없습니다. 다시 시도하세요.",
  "scan.scanFailedTitle": "스캔 실패",
  "scan.scanFailedBody": "사물을 인식할 수 없습니다. 다시 시도하세요.",
  "conv.placeholder": "탭해서 말하거나 입력하세요\u2026",
  "badge.firstScan.title": "첫 스캔",
  "badge.firstScan.desc": "첫 스캔을 완료하기",
  "badge.chatty.title": "수다쟁이",
  "badge.chatty.desc": "5회 대화하기",
  "badge.wordHoarder.title": "단어 수집가",
  "badge.wordHoarder.desc": "고유 단어 50개 모으기",
  "badge.polyglot.title": "다중언어자",
  "badge.polyglot.desc": "다른 언어 3개 연습하기",
  "badge.consistent.title": "꾸준함",
  "badge.consistent.desc": "7일 동안 연습하기",
  "badge.century.title": "백 단어",
  "badge.century.desc": "고유 단어 100개 모으기",
};

const ar: Dict = {
  "home.greeting": "مرحبًا، {name}!",
  "home.subtitleLine1": "امسح شيئًا من حولك",
  "home.subtitleLine2": "وابدأ محادثة حقيقية.",
  "home.dayStreak": "أيام متتالية",
  "home.aiChats": "محادثات الذكاء",
  "home.sessions": "{n} جلسات",
  "home.vocabulary": "المفردات",
  "home.words": "{n} كلمة",
  "home.dailyGoal": "هدف اليوم",
  "home.dailyProgress": "اليوم {done} / {goal}",
  "home.challenges": "التحديات",
  "home.earnBadges": "اكسب الشارات",
  "home.continueConvos": "تابع محادثاتك",
  "home.newHere": "جديد هنا؟",
  "home.newHereDesc": "التقط صورتك الأولى للبدء",
  "home.scanCta": "مسح",
  "home.practicing": "تتدرّب على {lang}",
  "home.continueBtn": "متابعة",
  "home.tapToContinue": "اضغط للمتابعة",
  "home.scanLearnSpeak": "امسح. تعلّم. تحدّث.",
  "home.heroDesc": "وجّه الكاميرا وابدأ التعلم",
  "tabs.home": "الرئيسية",
  "tabs.history": "السجل",
  "tabs.scan": "مسح",
  "settings.title": "الإعدادات",
  "settings.learning": "أتعلّم",
  "settings.iSpeak": "أتحدث",
  "settings.learningSub": "أتعلّم {lang}",
  "settings.languages": "اللغات",
  "settings.preferences": "التفضيلات",
  "settings.about": "حول",
  "settings.haptics": "اهتزاز",
  "settings.hapticsSub": "اهتزاز عند الضغط",
  "settings.daily": "تذكير يومي",
  "settings.dailySub": "تدرّب يوميًا",
  "settings.help": "المساعدة والدعم",
  "settings.version": "الإصدار",
  "settings.chooseLearning": "اختر لغة لتتعلمها",
  "settings.chooseNative": "اختر لغتك",
  "settings.helpAlertTitle": "المساعدة",
  "settings.helpAlertBody": "راسلنا على hello@linguascan.app",
  "vocab.title": "المفردات",
  "vocab.all": "الكل",
  "vocab.empty": "لا توجد كلمات بعد",
  "vocab.emptySub": "امسح شيئًا وابدأ محادثة لبناء مفرداتك.",
  "vocab.unique": "{n} كلمة فريدة",
  "vocab.from": "من «{title}»",
  "progress.title": "تقدّم اليوم",
  "progress.today": "اليوم",
  "progress.complete": "اكتمل الهدف. أحسنت!",
  "progress.more": "{n} متبقية لتحقيق هدفك",
  "progress.activeDays": "الأيام النشطة",
  "progress.last7": "آخر 7 أيام",
  "challenges.title": "التحديات",
  "challenges.earned": "الشارات المكتسبة",
  "challenges.keepGoing": "تابع المسح والدردشة لفتح المزيد.",
  "challenges.earnedTag": "مكتسبة",
  "history.title": "السجل",
  "history.deleteTitle": "حذف المحادثة؟",
  "history.deleteBody": "إزالة «{name}» من السجل؟",
  "history.cancel": "إلغاء",
  "history.delete": "حذف",
  "history.empty": "لا توجد محادثات بعد",
  "history.emptySub": "ستظهر محادثاتك السابقة هنا",
  "scan.captureFailedTitle": "فشل الالتقاط",
  "scan.captureFailedBody": "تعذّر التقاط الصورة. حاول مرة أخرى.",
  "scan.scanFailedTitle": "فشل المسح",
  "scan.scanFailedBody": "تعذّر التعرّف على العنصر. حاول مرة أخرى.",
  "conv.placeholder": "اضغط للتحدث أو الكتابة\u2026",
  "badge.firstScan.title": "أول مسح",
  "badge.firstScan.desc": "أكمل أول عملية مسح",
  "badge.chatty.title": "ثرثار",
  "badge.chatty.desc": "أجرِ 5 محادثات",
  "badge.wordHoarder.title": "جامع الكلمات",
  "badge.wordHoarder.desc": "اجمع 50 كلمة فريدة",
  "badge.polyglot.title": "متعدد اللغات",
  "badge.polyglot.desc": "تدرّب على 3 لغات مختلفة",
  "badge.consistent.title": "ثابت",
  "badge.consistent.desc": "تدرّب في 7 أيام مختلفة",
  "badge.century.title": "المئة",
  "badge.century.desc": "اجمع 100 كلمة فريدة",
};

const ru: Dict = {
  "home.greeting": "Привет, {name}!",
  "home.subtitleLine1": "Отсканируйте что-нибудь рядом",
  "home.subtitleLine2": "и начните настоящий разговор.",
  "home.dayStreak": "Дней подряд",
  "home.aiChats": "ИИ-чаты",
  "home.sessions": "{n} сессий",
  "home.vocabulary": "Словарь",
  "home.words": "{n} слов",
  "home.dailyGoal": "Цель на день",
  "home.dailyProgress": "Сегодня {done} / {goal}",
  "home.challenges": "Задания",
  "home.earnBadges": "Получайте значки",
  "home.continueConvos": "Продолжите ваши беседы",
  "home.newHere": "Здесь впервые?",
  "home.newHereDesc": "Сделайте первое фото, чтобы начать",
  "home.scanCta": "Сканировать",
  "home.practicing": "Учите {lang}",
  "home.continueBtn": "Продолжить",
  "home.tapToContinue": "Нажмите, чтобы продолжить",
  "home.scanLearnSpeak": "Скан. Учись. Говори.",
  "home.heroDesc": "Наведите камеру и начните учиться",
  "tabs.home": "Главная",
  "tabs.history": "История",
  "tabs.scan": "Скан",
  "settings.title": "Настройки",
  "settings.learning": "Изучаю",
  "settings.iSpeak": "Говорю на",
  "settings.learningSub": "Изучаю {lang}",
  "settings.languages": "ЯЗЫКИ",
  "settings.preferences": "ПРЕДПОЧТЕНИЯ",
  "settings.about": "О ПРИЛОЖЕНИИ",
  "settings.haptics": "Вибрация",
  "settings.hapticsSub": "Вибрация при действиях",
  "settings.daily": "Ежедневное напоминание",
  "settings.dailySub": "Занимайтесь каждый день",
  "settings.help": "Помощь и поддержка",
  "settings.version": "Версия",
  "settings.chooseLearning": "Выберите язык для изучения",
  "settings.chooseNative": "Выберите ваш язык",
  "settings.helpAlertTitle": "Помощь",
  "settings.helpAlertBody": "Напишите нам на hello@linguascan.app",
  "vocab.title": "Словарь",
  "vocab.all": "Все",
  "vocab.empty": "Пока нет слов",
  "vocab.emptySub": "Отсканируйте объект и начните разговор, чтобы пополнить словарь.",
  "vocab.unique": "{n} уникальных слов",
  "vocab.from": "из «{title}»",
  "progress.title": "Прогресс за день",
  "progress.today": "СЕГОДНЯ",
  "progress.complete": "Цель достигнута. Отлично!",
  "progress.more": "Ещё {n} до цели",
  "progress.activeDays": "Активных дней",
  "progress.last7": "Последние 7 дней",
  "challenges.title": "Задания",
  "challenges.earned": "ПОЛУЧЕНО ЗНАЧКОВ",
  "challenges.keepGoing": "Продолжайте сканировать и общаться, чтобы открыть больше.",
  "challenges.earnedTag": "Получено",
  "history.title": "История",
  "history.deleteTitle": "Удалить разговор?",
  "history.deleteBody": "Удалить «{name}» из истории?",
  "history.cancel": "Отмена",
  "history.delete": "Удалить",
  "history.empty": "Пока нет разговоров",
  "history.emptySub": "Ваши прошлые чаты появятся здесь",
  "scan.captureFailedTitle": "Сбой съёмки",
  "scan.captureFailedBody": "Не удалось сделать снимок. Попробуйте ещё раз.",
  "scan.scanFailedTitle": "Сбой сканирования",
  "scan.scanFailedBody": "Не удалось распознать объект. Попробуйте ещё раз.",
  "conv.placeholder": "Нажмите, чтобы говорить или печатать\u2026",
  "badge.firstScan.title": "Первый скан",
  "badge.firstScan.desc": "Завершите первое сканирование",
  "badge.chatty.title": "Болтун",
  "badge.chatty.desc": "Проведите 5 разговоров",
  "badge.wordHoarder.title": "Коллекционер слов",
  "badge.wordHoarder.desc": "Соберите 50 уникальных слов",
  "badge.polyglot.title": "Полиглот",
  "badge.polyglot.desc": "Практикуйте 3 разных языка",
  "badge.consistent.title": "Постоянство",
  "badge.consistent.desc": "Занимайтесь 7 разных дней",
  "badge.century.title": "Сотня",
  "badge.century.desc": "Соберите 100 уникальных слов",
};

const hi: Dict = {
  "home.greeting": "नमस्ते, {name}!",
  "home.subtitleLine1": "अपने आस-पास कुछ स्कैन करें",
  "home.subtitleLine2": "और असली बातचीत शुरू करें।",
  "home.dayStreak": "लगातार दिन",
  "home.aiChats": "एआई चैट",
  "home.sessions": "{n} सत्र",
  "home.vocabulary": "शब्दावली",
  "home.words": "{n} शब्द",
  "home.dailyGoal": "आज का लक्ष्य",
  "home.dailyProgress": "आज {done} / {goal}",
  "home.challenges": "चुनौतियाँ",
  "home.earnBadges": "बैज पाएँ",
  "home.continueConvos": "अपनी बातचीत जारी रखें",
  "home.newHere": "नए हैं?",
  "home.newHereDesc": "शुरू करने के लिए पहली फ़ोटो लें",
  "home.scanCta": "स्कैन",
  "home.practicing": "{lang} का अभ्यास",
  "home.continueBtn": "जारी रखें",
  "home.tapToContinue": "जारी रखने के लिए टैप करें",
  "home.scanLearnSpeak": "स्कैन. सीखें. बोलें.",
  "home.heroDesc": "कैमरा घुमाएँ और सीखना शुरू करें",
  "tabs.home": "होम",
  "tabs.history": "इतिहास",
  "tabs.scan": "स्कैन",
  "settings.title": "सेटिंग्स",
  "settings.learning": "सीख रहे हैं",
  "settings.iSpeak": "मैं बोलता/बोलती हूँ",
  "settings.learningSub": "{lang} सीख रहे हैं",
  "settings.languages": "भाषाएँ",
  "settings.preferences": "वरीयताएँ",
  "settings.about": "ऐप के बारे में",
  "settings.haptics": "कंपन",
  "settings.hapticsSub": "क्रिया पर कंपन",
  "settings.daily": "रोज़ का रिमाइंडर",
  "settings.dailySub": "रोज़ अभ्यास करें",
  "settings.help": "सहायता",
  "settings.version": "संस्करण",
  "settings.chooseLearning": "सीखने के लिए भाषा चुनें",
  "settings.chooseNative": "अपनी भाषा चुनें",
  "settings.helpAlertTitle": "सहायता",
  "settings.helpAlertBody": "हमें hello@linguascan.app पर लिखें",
  "vocab.title": "शब्दावली",
  "vocab.all": "सभी",
  "vocab.empty": "अभी कोई शब्द नहीं",
  "vocab.emptySub": "किसी वस्तु को स्कैन करें और बातचीत शुरू करें ताकि आपकी शब्दावली बढ़े।",
  "vocab.unique": "{n} अद्वितीय शब्द",
  "vocab.from": "«{title}» से",
  "progress.title": "रोज़ की प्रगति",
  "progress.today": "आज",
  "progress.complete": "लक्ष्य पूरा। बढ़िया!",
  "progress.more": "लक्ष्य के लिए {n} और",
  "progress.activeDays": "सक्रिय दिन",
  "progress.last7": "पिछले 7 दिन",
  "challenges.title": "चुनौतियाँ",
  "challenges.earned": "अर्जित बैज",
  "challenges.keepGoing": "और अनलॉक करने के लिए स्कैन और चैट करते रहें।",
  "challenges.earnedTag": "अर्जित",
  "history.title": "इतिहास",
  "history.deleteTitle": "बातचीत हटाएँ?",
  "history.deleteBody": "इतिहास से «{name}» हटाएँ?",
  "history.cancel": "रद्द",
  "history.delete": "हटाएँ",
  "history.empty": "अभी कोई बातचीत नहीं",
  "history.emptySub": "आपकी पुरानी चैट यहाँ दिखेंगी",
  "scan.captureFailedTitle": "फ़ोटो विफल",
  "scan.captureFailedBody": "फ़ोटो नहीं ली जा सकी। पुनः प्रयास करें।",
  "scan.scanFailedTitle": "स्कैन विफल",
  "scan.scanFailedBody": "वस्तु पहचानी नहीं जा सकी। पुनः प्रयास करें।",
  "conv.placeholder": "बोलने के लिए टैप करें या लिखें\u2026",
  "badge.firstScan.title": "पहला स्कैन",
  "badge.firstScan.desc": "अपना पहला स्कैन पूरा करें",
  "badge.chatty.title": "बातूनी",
  "badge.chatty.desc": "5 बातचीत करें",
  "badge.wordHoarder.title": "शब्द संग्राहक",
  "badge.wordHoarder.desc": "50 अद्वितीय शब्द जमा करें",
  "badge.polyglot.title": "बहुभाषी",
  "badge.polyglot.desc": "3 अलग-अलग भाषाओं का अभ्यास",
  "badge.consistent.title": "नियमित",
  "badge.consistent.desc": "7 अलग-अलग दिन अभ्यास करें",
  "badge.century.title": "शतक",
  "badge.century.desc": "100 अद्वितीय शब्द जमा करें",
};

const nl: Dict = {
  "home.greeting": "Hallo, {name}!",
  "home.subtitleLine1": "Scan iets in je omgeving",
  "home.subtitleLine2": "en begin een echt gesprek.",
  "home.dayStreak": "Dagenreeks",
  "home.aiChats": "AI-chats",
  "home.sessions": "{n} sessies",
  "home.vocabulary": "Woordenschat",
  "home.words": "{n} woorden",
  "home.dailyGoal": "Daggoal",
  "home.dailyProgress": "{done} / {goal} vandaag",
  "home.challenges": "Uitdagingen",
  "home.earnBadges": "Verdien badges",
  "home.continueConvos": "Ga verder met je gesprekken",
  "home.newHere": "Nieuw hier?",
  "home.newHereDesc": "Neem je eerste foto om te beginnen",
  "home.scanCta": "Scan",
  "home.practicing": "Je oefent {lang}",
  "home.continueBtn": "Doorgaan",
  "home.tapToContinue": "Tik om door te gaan",
  "home.scanLearnSpeak": "Scan. Leer. Spreek.",
  "home.heroDesc": "Richt je camera en begin met leren",
  "tabs.home": "Home",
  "tabs.history": "Geschiedenis",
  "tabs.scan": "Scan",
  "settings.title": "Instellingen",
  "settings.learning": "Aan het leren",
  "settings.iSpeak": "Ik spreek",
  "settings.learningSub": "Je leert {lang}",
  "settings.languages": "TALEN",
  "settings.preferences": "VOORKEUREN",
  "settings.about": "INFO",
  "settings.haptics": "Trillen",
  "settings.hapticsSub": "Trillen bij acties",
  "settings.daily": "Dagelijkse herinnering",
  "settings.dailySub": "Oefen elke dag",
  "settings.help": "Hulp en support",
  "settings.version": "Versie",
  "settings.chooseLearning": "Kies een taal om te leren",
  "settings.chooseNative": "Kies je taal",
  "settings.helpAlertTitle": "Hulp",
  "settings.helpAlertBody": "Mail ons op hello@linguascan.app",
  "vocab.title": "Woordenschat",
  "vocab.all": "Alle",
  "vocab.empty": "Nog geen woorden",
  "vocab.emptySub": "Scan een object en begin een gesprek om je woordenschat op te bouwen.",
  "vocab.unique": "{n} unieke woorden",
  "vocab.from": "uit \u201C{title}\u201D",
  "progress.title": "Dagvoortgang",
  "progress.today": "VANDAAG",
  "progress.complete": "Doel behaald. Goed gedaan!",
  "progress.more": "Nog {n} voor je doel",
  "progress.activeDays": "Actieve dagen",
  "progress.last7": "Laatste 7 dagen",
  "challenges.title": "Uitdagingen",
  "challenges.earned": "BADGES VERDIEND",
  "challenges.keepGoing": "Blijf scannen en chatten om meer te ontgrendelen.",
  "challenges.earnedTag": "Behaald",
  "history.title": "Geschiedenis",
  "history.deleteTitle": "Gesprek verwijderen?",
  "history.deleteBody": "\u201C{name}\u201D uit geschiedenis verwijderen?",
  "history.cancel": "Annuleren",
  "history.delete": "Verwijderen",
  "history.empty": "Nog geen gesprekken",
  "history.emptySub": "Je eerdere chats verschijnen hier",
  "scan.captureFailedTitle": "Opname mislukt",
  "scan.captureFailedBody": "Foto maken mislukt. Probeer opnieuw.",
  "scan.scanFailedTitle": "Scan mislukt",
  "scan.scanFailedBody": "Object kon niet worden herkend. Probeer opnieuw.",
  "conv.placeholder": "Tik om te spreken of typ\u2026",
  "badge.firstScan.title": "Eerste scan",
  "badge.firstScan.desc": "Doe je eerste scan",
  "badge.chatty.title": "Praatgraag",
  "badge.chatty.desc": "Voer 5 gesprekken",
  "badge.wordHoarder.title": "Woordenverzamelaar",
  "badge.wordHoarder.desc": "Verzamel 50 unieke woorden",
  "badge.polyglot.title": "Polyglot",
  "badge.polyglot.desc": "Oefen 3 verschillende talen",
  "badge.consistent.title": "Volhardend",
  "badge.consistent.desc": "Oefen op 7 verschillende dagen",
  "badge.century.title": "Honderdtal",
  "badge.century.desc": "Verzamel 100 unieke woorden",
};

const DICTIONARIES: Record<Locale, Dict> = {
  English: en,
  Spanish: es,
  French: fr,
  German: de,
  Italian: it,
  Portuguese: pt,
  Japanese: ja,
  Chinese: zh,
  Korean: ko,
  Arabic: ar,
  Russian: ru,
  Hindi: hi,
  Dutch: nl,
};

export function translate(
  locale: Locale,
  key: TKey,
  vars?: Record<string, string | number>,
): string {
  const dict = DICTIONARIES[locale] ?? en;
  const raw = dict[key] ?? en[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  English: "English",
  Spanish: "Español",
  French: "Français",
  German: "Deutsch",
  Italian: "Italiano",
  Portuguese: "Português",
  Japanese: "日本語",
  Chinese: "中文",
  Korean: "한국어",
  Arabic: "العربية",
  Russian: "Русский",
  Hindi: "हिन्दी",
  Dutch: "Nederlands",
};
