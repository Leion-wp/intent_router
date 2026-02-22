export type TreeFolder = {
  id: string;
  name: string;
  isFolder: true;
  children: (TreeFolder | TreeLeaf)[];
};

export type TreeLeaf = {
  id: string;
  name: string;
  isFolder: false;
  data: any;
};

export function buildHistoryTree(history: any[]): (TreeFolder | TreeLeaf)[] {
  const root: (TreeFolder | TreeLeaf)[] = [];

  history.forEach((run) => {
    const parts = (run.name || 'Untitled').split('/').map((p: string) => p.trim());
    let currentLevel = root;

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;

      if (isLast) {
        currentLevel.push({
          id: run.id || `leaf-${Math.random()}`,
          name: part,
          isFolder: false,
          data: run
        });
      } else {
        let folder = currentLevel.find((item) => item.isFolder && item.name === part) as TreeFolder;
        if (!folder) {
          folder = {
            id: `folder-${part}-${index}`,
            name: part,
            isFolder: true,
            children: []
          };
          currentLevel.push(folder);
        }
        currentLevel = folder.children;
      }
    });
  });

  return root;
}
