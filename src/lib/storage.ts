import fs from "fs";
import path from "path";

export interface SaveFileResult {
  storageKey: string;
  absolutePath: string;
}

export interface IStorageProvider {
  saveFile(projectId: string, filename: string, buffer: Buffer, folder?: string): Promise<SaveFileResult>;
  getFilePath(storageKey: string): string;
  readFile(storageKey: string): Promise<Buffer>;
  deleteFile(storageKey: string): Promise<boolean>;
  deleteProject(projectId: string): Promise<boolean>;
  fileExists(storageKey: string): boolean;
}

class LocalStorageProvider implements IStorageProvider {
  private baseDir: string;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), process.env.STORAGE_PATH || "./storage");
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public async saveFile(
    projectId: string,
    filename: string,
    buffer: Buffer,
    folder: string = "videos"
  ): Promise<SaveFileResult> {
    const safeFilename = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const projectFolder = path.join(this.baseDir, "projects", projectId, folder);

    if (!fs.existsSync(projectFolder)) {
      fs.mkdirSync(projectFolder, { recursive: true });
    }

    const targetPath = path.join(projectFolder, safeFilename);
    await fs.promises.writeFile(targetPath, buffer);

    // Relative storage key (e.g. projects/{projectId}/videos/{filename})
    const storageKey = path.relative(this.baseDir, targetPath).replace(/\\/g, "/");

    return {
      storageKey,
      absolutePath: targetPath,
    };
  }

  public getFilePath(storageKey: string): string {
    const normalizedKey = storageKey.replace(/^\/+/, "");
    return path.join(this.baseDir, normalizedKey);
  }

  public async readFile(storageKey: string): Promise<Buffer> {
    const filePath = this.getFilePath(storageKey);
    return await fs.promises.readFile(filePath);
  }

  public async deleteFile(storageKey: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(storageKey);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public async deleteProject(projectId: string): Promise<boolean> {
    try {
      const projectDir = path.join(this.baseDir, "projects", projectId);
      if (fs.existsSync(projectDir)) {
        await fs.promises.rm(projectDir, { recursive: true, force: true });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public fileExists(storageKey: string): boolean {
    const filePath = this.getFilePath(storageKey);
    return fs.existsSync(filePath);
  }
}

export const storage: IStorageProvider = new LocalStorageProvider();
