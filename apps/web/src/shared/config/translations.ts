import type { AppLocale, AppTheme } from "@/shared/config/preferences";

type Messages = {
  navigation: {
    home: string;
    laboratories: string;
    main: string;
  };
  eyebrow: string;
  title: string;
  description: string;
  preferences: string;
  settingsMenu: string;
  theme: string;
  language: string;
  markdownReader: {
    title: string;
    description: string;
    selectFile: string;
    dropHint: string;
    acceptedFiles: string;
    loading: string;
    replaceFile: string;
    emptyTitle: string;
    emptyDescription: string;
    invalidExtension: string;
    fileTooLarge: string;
    readFailed: string;
    parseFailed: string;
  };
  laboratoriesPage: {
    eyebrow: string;
    title: string;
    description: string;
    emptyTitle: string;
    emptyDescription: string;
  };
  adminPage: {
    eyebrow: string;
    title: string;
    description: string;
  };
  themes: Record<AppTheme, string>;
  languages: Record<AppLocale, string>;
};

export const messages = {
  es: {
    navigation: {
      home: "Ir al inicio",
      laboratories: "Laboratorios",
      main: "Navegación principal",
    },
    eyebrow: "Base inicial",
    title: "Plataforma web escalable",
    description:
      "Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query y Zustand.",
    preferences: "Preferencias",
    settingsMenu: "Abrir preferencias",
    theme: "Tema",
    language: "Idioma",
    markdownReader: {
      title: "Lector Markdown",
      description:
        "Selecciona un archivo Markdown local para interpretarlo y mostrar su estructura.",
      selectFile: "Seleccionar archivo .md",
      dropHint: "o arrástralo hasta aquí",
      acceptedFiles: "Archivos .md o .markdown, máximo 2 MiB",
      loading: "Procesando documento…",
      replaceFile: "Cambiar archivo",
      emptyTitle: "Aún no hay un documento cargado",
      emptyDescription:
        "El contenido del archivo permanecerá en tu navegador y no se enviará a un servidor.",
      invalidExtension: "Selecciona un archivo con extensión .md o .markdown.",
      fileTooLarge: "El archivo supera el tamaño máximo permitido de 2 MiB.",
      readFailed: "No fue posible leer el archivo seleccionado.",
      parseFailed: "No fue posible interpretar el contenido Markdown.",
    },
    laboratoriesPage: {
      eyebrow: "Biblioteca",
      title: "Laboratorios",
      description:
        "Explora laboratorios organizados por categorías, entregables y niveles de aprendizaje.",
      emptyTitle: "Los laboratorios estarán disponibles pronto",
      emptyDescription:
        "Esta sección está preparada para conectarse con el catálogo y el buscador de contenidos.",
    },
    adminPage: {
      eyebrow: "Administración",
      title: "Herramientas de contenido",
      description:
        "Carga y valida documentos Markdown antes de incorporarlos al catálogo.",
    },
    themes: {
      "light-blue": "Claro azul",
      "light-purple": "Claro morado",
      "light-orange": "Claro naranja",
      "light-pink": "Claro rosa",
      "dark-blue": "Oscuro azul",
      "dark-purple": "Oscuro morado",
      "dark-orange": "Oscuro naranja",
      "dark-pink": "Oscuro rosa",
    },
    languages: {
      es: "Español",
      en: "Inglés",
    },
  },
  en: {
    navigation: {
      home: "Go to home page",
      laboratories: "Laboratories",
      main: "Main navigation",
    },
    eyebrow: "Initial foundation",
    title: "Scalable web platform",
    description:
      "Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, and Zustand.",
    preferences: "Preferences",
    settingsMenu: "Open preferences",
    theme: "Theme",
    language: "Language",
    markdownReader: {
      title: "Markdown reader",
      description:
        "Select a local Markdown file to parse and display its structure.",
      selectFile: "Select .md file",
      dropHint: "or drop it here",
      acceptedFiles: ".md or .markdown files, up to 2 MiB",
      loading: "Processing document…",
      replaceFile: "Change file",
      emptyTitle: "No document has been loaded yet",
      emptyDescription:
        "The file contents stay in your browser and are not sent to a server.",
      invalidExtension: "Select a file with a .md or .markdown extension.",
      fileTooLarge: "The file exceeds the maximum allowed size of 2 MiB.",
      readFailed: "The selected file could not be read.",
      parseFailed: "The Markdown content could not be parsed.",
    },
    laboratoriesPage: {
      eyebrow: "Library",
      title: "Laboratories",
      description:
        "Explore laboratories organized by category, deliverable, and learning level.",
      emptyTitle: "Laboratories will be available soon",
      emptyDescription:
        "This section is ready to connect to the content catalog and search engine.",
    },
    adminPage: {
      eyebrow: "Administration",
      title: "Content tools",
      description:
        "Load and validate Markdown documents before adding them to the catalog.",
    },
    themes: {
      "light-blue": "Light blue",
      "light-purple": "Light purple",
      "light-orange": "Light orange",
      "light-pink": "Light pink",
      "dark-blue": "Dark blue",
      "dark-purple": "Dark purple",
      "dark-orange": "Dark orange",
      "dark-pink": "Dark pink",
    },
    languages: {
      es: "Spanish",
      en: "English",
    },
  },
} satisfies Record<AppLocale, Messages>;
