'use strict';

import * as vscode from 'vscode';
import { TreeExplorerNodeProvider } from 'vscode';

import * as fs from 'fs';
import * as path from 'path';

const courseName: string = 'Python教程在线练习';
const courseOpenCommand: string = 'extension.openLiaoxuefengPyCourses';
const courseUrl: string = 'http://www.liaoxuefeng.com/api/wikis/0014316089557264a6b348958f449949df42a6d3a2e542c000/wikipages';

const request = require('request');

export function activate(context: vscode.ExtensionContext) {
  // The `providerId` here must be identical to `contributes.explorer.treeExplorerNodeProviderId` in package.json.
  vscode.window.registerTreeExplorerNodeProvider('liaoxuefengPyCourse', new CourseProvider());
  console.log('TreeExplorerNodeProvider registered.');
  
  // This command will be invoked using exactly the node you provided in `resolveChildren`.
  vscode.commands.registerCommand(courseOpenCommand, (node: CourseNode) => {
    console.log('on command...');
    if (node.kind === 'leaf') {
      console.log('Download course as zip...');
      vscode.window.showInformationMessage('Download start...');
      let opts = {
        url: 'http://www.liaoxuefeng.com/api/categories',
        method: 'GET'
      };
      request(opts, function (err, resp, body) {
        if (err || resp.statusCode!==200) {
          console.log(err);
          vscode.window.showErrorMessage('下载 '+opts.url+' 失败，错误码：' + resp.statusCode);
        } else {
          console.log(body);
          vscode.window.showInformationMessage('正在通过新窗口打开练习...');
          vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.parse('file:///Users/liaoxuefeng/Github/pyquant'), true);
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
        node.children = [new Leaf('没有练习', null)];
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