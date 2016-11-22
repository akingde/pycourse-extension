'use strict';

import * as vscode from 'vscode';
import { TreeExplorerNodeProvider } from 'vscode';

import * as os from 'os';
import * as path from 'path';

const courseName: string = 'Python教程在线练习';
const courseOpenCommand: string = 'extension.openLiaoxuefengPyCourses';
const courseUrl: string = 'http://www.liaoxuefeng.com/api/wikis/0014316089557264a6b348958f449949df42a6d3a2e542c000/wikipages';

const request = require('request');
const fs = require('mz/fs');
const unzip = require('unzip');

const workingDir = path.join(os.homedir(), '__pycourses__');
const tmpDir = path.join(workingDir, '__tmp__');

async function rmdirIfNecessary(p: string) {
  var stat = null;
  try {
    stat = await fs.stat(p);
    if (stat.isFile()) {
      await fs.unlink(p);
    }
    if (stat.isDirectory()) {
      var sub, subs = await fs.readdir(p);
      for (sub of subs) {
        await rmdirIfNecessary(path.join(p, sub));
      }
      await fs.rmdir(p);
    }
  } catch (e) {}
}

async function mkdirIfNecessary(p: string) {
  var stat = null;
  try {
    stat = await fs.stat(p);
  } catch (e) {}
  if (!stat || !stat.isDirectory()) {
    await fs.mkdir(p);
  }
}

async function processUnzip() {
  // copy from xxx to ../xxx(?):
  var subs = await fs.readdir(tmpDir);
  subs = subs.filter((name) => {
    return name !== 'tmp.zip';
  });
  if (subs.length !== 1) {
    vscode.window.showErrorMessage('解压缩出错: 未找到解压后的文件夹.');
    return;
  }
  var name = subs[0];
  var stat = await fs.stat(path.join(tmpDir, name));
  if (!stat.isDirectory()) {
    vscode.window.showErrorMessage('解压缩出错: 解压后非文件夹.');
    return;
  }
  subs = await fs.readdir(workingDir);
  subs = subs.filter((name) => {
    return name.startsWith(name);
  });
  var index = 1;
  var newName = name;
  while (subs.indexOf(newName)>=0) {
    index ++;
    newName = name + '(' + index + ')';
  }
  await fs.rename(path.join(tmpDir, name), path.join(workingDir, newName));
  await rmdirIfNecessary(tmpDir);
  vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.parse('file://' + path.join(workingDir, newName)), true);
  vscode.window.showInformationMessage('已在新窗口打开' + newName);
}

async function unzipThenOpen(data: Buffer) {
  var tmpZipFile = path.join(tmpDir, 'tmp.zip');
  await mkdirIfNecessary(workingDir);
  await rmdirIfNecessary(tmpDir);
  await mkdirIfNecessary(tmpDir);

  // write to zip file:
  var w = fs.createWriteStream(tmpZipFile, {
    defaultEncoding: null
  });
  w.end(data, function () {
    var zipWriter = unzip.Extract({
      path: tmpDir
    });
    zipWriter.on('error', function (e) {
      vscode.window.showErrorMessage('解压缩错误: ' + e);
    });
    zipWriter.on('close', function () {
      processUnzip();
    });
    fs.createReadStream(tmpZipFile).pipe(zipWriter);
  });
}

export function activate(context: vscode.ExtensionContext) {
  // The `providerId` here must be identical to `contributes.explorer.treeExplorerNodeProviderId` in package.json.
  vscode.window.registerTreeExplorerNodeProvider('liaoxuefengPyCourse', new CourseProvider());
  console.log('TreeExplorerNodeProvider registered.');
  
  // This command will be invoked using exactly the node you provided in `resolveChildren`.
  vscode.commands.registerCommand(courseOpenCommand, (node: CourseNode) => {
    if (node.kind === 'leaf') {
      vscode.window.showInformationMessage('开始下载 ' + node.name + '...');
      let opts = {
        url: node.url,
        method: 'GET',
        encoding: null
      };
      request(opts, function (err, resp, body) {
        if (err || resp.statusCode!==200) {
          vscode.window.showErrorMessage('下载 ' + opts.url + ' 失败，错误码：' + resp.statusCode);
        } else {
          unzipThenOpen(body);
        }
      });
    }
  });
}

class CourseProvider implements TreeExplorerNodeProvider<CourseNode> {
  constructor() {
  }

  /**
   * As root node is invisible, its label doesn't matter.
   */
  getLabel(node: CourseNode): string {
    return node.name;
  }
  
  /**
   * Leaf is unexpandable.
   */
  getHasChildren(node: CourseNode): boolean {
    return node.kind !== 'leaf';
  }
  
  /**
   * Invoke `open course` command when a Leaf node is clicked.
   */
  getClickCommand(node: CourseNode): string {
    if (node.kind === 'leaf') {
      return courseOpenCommand;
    }
    return null;
  }

  provideRootNode(): CourseNode {
    return new Root();
  }
  
  resolveChildren(node: CourseNode): Thenable<CourseNode[]> {
    return new Promise((resolve) => {
      switch (node.kind) {
        case 'root':
          let opts = {
            url: courseUrl,
            method: 'GET'
          };
          var that = this;
          request(opts, function (err, resp, body) {
            if (err || resp.statusCode!==200) {
              console.log(err);
              vscode.window.showErrorMessage('获取课程列表失败： ' + opts.url + ' ，错误码：' + resp.statusCode);
              resolve([]);
            } else {
              try {
                var data = JSON.parse(body);
                console.log(JSON.stringify(data));
                resolve(that.parseChildren(data.children));
              } catch (e) {
                vscode.window.showErrorMessage('获取课程列表失败： ' + opts.url + ' ，错误：' + e);
              }
            }
          });
          break;
        case 'node':
          resolve(node.children);
          break;
        case 'leaf':
          resolve([]);
          break;
      }
    });
  }
  
  private parseChildren(arr: any): CourseNode[] {
    return arr.map(function (w): CourseNode {
      var node = new Node(w.name);
      node.children = this.parseChildren(w.children);
      if (node.children.length === 0) {
        //node.children = [new Leaf('没有练习', null)];
        node.children = [new Leaf('练习', 'https://fyedur.oss-cn-hangzhou.aliyuncs.com/2016/1108/221346/1b124j9540ag0830001j.zip')];
      }
      return node;
    }, this);
  }

  private pathExists(p: string): boolean {
    try {
      fs.accessSync(p);
    } catch (err) {
      return false;
    }
    return true;
  }
}

type CourseNode = Root // Root node
             | Node // A dependency installed to `node_modules`
             | Leaf // A dependency not present in `node_modules`
             ;

class Root {
  kind: 'root' = 'root';
  public name: string = courseName;
  public children: CourseNode[] = [];
}

class Node {
  kind: 'node' = 'node';
  public children: CourseNode[] = [];
  
  constructor(
    public name: string
  ) {
  }
}

class Leaf {
  kind: 'leaf' = 'leaf'

  constructor(
    public name: string,
    public url: string
  ) {
  }
}