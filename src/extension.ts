/*
 * Copyright 2018-present Samsung Electronics Co., Ltd. and other contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// FIX ME: Change this require to a more consistent solution.
// tslint:disable-next-line:no-var-requires
const iotjs = require('./IotjsFunctions.json');

const defaultModules = [{
  link: 'process',
  mod: 'process',
}, {
  link: 'emitter',
  mod: 'events',
}, {
  link: 'timers',
  mod: 'timers',
}];

const JS_MODE: vscode.DocumentFilter = { language: 'javascript', scheme: 'file' };

const initialConfigurations = [{
  name: 'Attach',
  type: 'iotjs',
  request: 'attach',
  address: 'localhost',
  port: 5001,
  localRoot: '${workspaceRoot}',
  stopOnEntry: false,
  debugLog: 0
}];

const provideInitialConfigurations = (): string => {
  const config = JSON.stringify(initialConfigurations, null, '\t').split('\n')
                                                                  .map(line => '\t' + line)
                                                                  .join('\n').trim();

  return [
    '{',
    '\t"version": "0.2.0",',
    `\t"configurations": ${config}`,
    '}'
  ].join('\n');
};

const walkSync = (dir: string, filelist: string[] = []): string[] => {
  fs.readdirSync(dir).forEach(file => {
    filelist = fs.statSync(path.join(dir, file)).isDirectory()
      ? walkSync(path.join(dir, file), filelist)
      : filelist.concat(path.join(dir, file));
  });

  return filelist.filter(f => path.extname(f).toLowerCase().match(/\.(js)$/i) && f !== '' && (fs.statSync(f).size) > 0);
};

const getListOfFiles = (): string[] => {
  let wsFiles: string[] = [];

  vscode.workspace.workspaceFolders.map(folder => folder.uri.fsPath).forEach(entry => {
    wsFiles = [...wsFiles, ...walkSync(entry)];
  });

  return wsFiles;
};

const getProgramName = (): Thenable<string> => {
  return vscode.window.showQuickPick(getListOfFiles(), {
    placeHolder: 'Select a file you want to debug',
    ignoreFocusOut: true
  });
};

const getProgramSource = (path: string): string => {
  return fs.readFileSync(path, {
    encoding: 'utf8',
    flag: 'r'
  });
};

const processCustomEvent = async (e: vscode.DebugSessionCustomEvent): Promise<any> => {
  switch (e.event) {
    case 'waitForSource': {
      if (vscode.debug.activeDebugSession) {
        const pathName = await getProgramName().then(path => path);
        const source = getProgramSource(pathName);

        vscode.debug.activeDebugSession.customRequest('sendSource', {
          program: {
            name: pathName.split(path.delimiter).pop(),
            source
          }
        });
      }
      return true;
    }
    default:
      return undefined;
  }
};

const lookForModules = (source: string) => {
  const rm = /^(var|let|const)?\s*([a-zA-Z0-9$_]+)\s*=[\s|\n]*require\s*\(\s*['"]([a-zA-Z0-9$_]+)['"]\s*\);?$/;
  return source.split('\n').filter(line => rm.test(line)).map(m => {
    const match = rm.exec(m);

    return {
      link: match[2],
      mod: match[3]
    };
  });
};

const createItems = (document: vscode.TextDocument, position: vscode.Position): Array<vscode.CompletionItem> => {
  const rm = /([a-zA-Z0-9 =]+)\.$/;
  const items: vscode.CompletionItem[] = [];
  const modules = Object.keys(iotjs);
  const textUntilPos = document.getText(document.getWordRangeAtPosition(position));
  const availableModules = defaultModules.concat(lookForModules(textUntilPos));
  const might = (document.lineAt(position.line).text).split(/\s/g).pop().replace(/\./g, '');
  const matchKey = Object.keys(availableModules).find(key => availableModules[key].link === might);

  if (document.lineAt(position.line).text.match(rm)) {
    modules.forEach(mod => {
      if (document.lineAt(position.line).text.includes(availableModules[matchKey].link) &&
      availableModules[matchKey].mod === mod) {
        for (let i in iotjs[mod]) {
          items.push(new vscode.CompletionItem(iotjs[mod][i].label, 2));
          items[i].detail = iotjs[mod][i].detail;
          items[i].insertText = iotjs[mod][i].insertText;
          items[i].documentation = iotjs[mod][i].documentation;
        }
      }
    });
  }
  return items;
};

const createModules = (document: vscode.TextDocument, position: vscode.Position): Array<vscode.CompletionItem> => {
  const rm = /^(var|let|const)?\s*([a-zA-Z0-9$_]+)\s*=[\s|\n]*require\s*\(\s*['"]/;
  const modules = Object.keys(iotjs);

  if (document.lineAt(position.line).text.match(rm)) {
    return modules.map(key => new vscode.CompletionItem(key, 2));
  }
  return [];
};

export const activate = (context: vscode.ExtensionContext) => {
  context.subscriptions.push(
    vscode.commands.registerCommand('iotjs-debug.provideInitialConfigurations', provideInitialConfigurations),
    vscode.debug.onDidReceiveDebugSessionCustomEvent(e => processCustomEvent(e)),
    vscode.languages.registerCompletionItemProvider(JS_MODE, {
      provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        return createModules(document, position);
      }
    }),
    vscode.languages.registerCompletionItemProvider(JS_MODE, {
      provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        return createItems(document, position);
      }
    }, '.')
  );
};

export const deactivate = () => {
  // Nothing to do.
};
