// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as path from "path";
import * as yaml from "js-yaml";
import { exec, spawn } from "child_process";
import { promisify } from "util";

interface Tool {
  output_channel: vscode.OutputChannel;
  refactor_script_path: string;
  root_dir: string;
}

let tool: Tool | undefined = undefined;

function getTool(): Tool {
  return tool!;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "Cxx-Module-Helper" is now active!'
  );

  const root_dir = vscode.workspace.workspaceFolders![0].uri.fsPath;
  tool = {
    root_dir: root_dir,
    output_channel: vscode.window.createOutputChannel("C++ Module Helper"),
    refactor_script_path: path.join(root_dir, "build_tools", "refactor.py"),
  };

  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles(renameFilesListener),
    vscode.workspace.onDidCreateFiles(createFilesListener),
    vscode.workspace.onDidDeleteFiles(deleteFilesListener),

    vscode.commands.registerCommand("cxx-module-helper.helloWorld", () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage(
        "Hello World from C++ Module Helper!"
      );
    })
  );
}

async function createFilesListener(event: vscode.FileCreateEvent) {
  for (const file of event.files) {
    const filename = path.basename(file.path);
    const command_prefix = `python ${getTool().refactor_script_path} ${
      getTool().root_dir
    }`;
    if (filename.endsWith(".ccm")) {
      const module_name = await vscode.window.showInputBox({
        title: `Press the module provided by ${filename}:`,
      });
      if (module_name) {
        const command = `${command_prefix} add_interface ${file.fsPath} ${module_name}  --new-file`;
        await runCommandInOrder(command);
      }
    } else if (filename.endsWith(".cc")) {
      const module_name = await vscode.window.showInputBox({
        title: `Press the module implemented by ${filename}:`,
      });
      if (module_name) {
        const command = `${command_prefix} add_impl ${file.fsPath} ${module_name} --new-file`;
        await runCommandInOrder(command);
      }
    }
  }
}

async function renameFilesListener(event: vscode.FileRenameEvent) {
  for (const file of event.files) {
    const command = `python ${getTool().refactor_script_path} ${
      getTool().root_dir
    } rename ${file.oldUri.fsPath} ${file.newUri.fsPath}`;
    await runCommandInOrder(command);
  }
}

async function deleteFilesListener(event: vscode.FileDeleteEvent) {
  console.log("occurred delete event:", event.files);
  for (const file of event.files) {
    const command = `python ${getTool().refactor_script_path} ${
      getTool().root_dir
    } delete ${file.fsPath}`;
    await runCommandInOrder(command);
  }
}

class AsyncQueue {
  private queue: Array<{ task: () => Promise<any>; resolve: any; reject: any }>;
  private isProcessing: boolean;
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  async enqueue(task: () => Promise<any>) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const { task, resolve, reject } = this.queue.shift()!;
    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.isProcessing = false;
      this.processQueue();
    }
  }
}

const asyncQueue = new AsyncQueue();

async function runCommandInOrder(command: string, show: boolean = false) {
  return asyncQueue.enqueue(() => runCommand(command, show));
}

async function runCommand(command: string, show: boolean = false) {
  return new Promise<void>((resolve, reject) => {
    console.log(`execute command: ${command}`);
    const channel = getTool().output_channel;
    if (show) {
      channel.show();
    }
    channel.appendLine(`execute command: ${command}`);
    const env = { ...process.env };
    env.Path = "C:\\Users\\ZhengyangZhao\\anaconda3;" + env.Path;
    const child = spawn(command, { shell: "powershell.exe", env: env });
    let last_received: "stdout" | "stderr" | "none" = "none";
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      if (last_received !== "stdout") {
        last_received = "stdout";
        channel.appendLine("----------------stdout----------------");
      }
      stdout += data;
      channel.append(String(data));
    });
    child.stderr.on("data", (data) => {
      if (last_received !== "stderr") {
        last_received = "stderr";
        channel.appendLine("----------------stderr----------------");
      }
      stderr += data;
      channel.append(String(data));
    });
    child.on("close", (code) => {
      console.log(`command exit, code: ${code}`);
      if (code !== 0) {
        channel.show();
      }
      console.log(`stdout:\n ${stdout}`);
      if (stderr) {
        console.log(`stderr:\n ${stderr}`);
      }
      resolve();
    });
  });
}

// This method is called when your extension is deactivated
export function deactivate() {}
