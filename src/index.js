import Binding from 'babel-traverse/lib/scope/binding'


export default function ({ types: t }) {
    function insertVariableDeclarationBeforePathAndUpdateScope(id, path) {
        let variableDeclaration = t.variableDeclaration('let', [t.variableDeclarator(id)])
        path.insertBefore(variableDeclaration)

        path.scope.bindings[id.name] = new Binding({
            identifier: id,
            existing: null,
            scope: path.scope,
            path: path,
            kind: 'let'
        })
    }

    let expressionStatementTransformer = {
        Identifier(path) {
            let pathParent = path.parent
            let pathNode = path.node

            if ((t.isObjectProperty(pathParent) && pathNode === pathParent.value) ||
                    (t.isArrayPattern(pathParent)) ||
                    (t.isAssignmentPattern(pathParent) && pathNode === pathParent.left) ||
                    (t.isRestElement(pathParent)) ||
                    (t.isRestProperty(pathParent))) {

                if (!this.expressionStatementPath.scope.hasBinding(pathNode.name)) {
                    insertVariableDeclarationBeforePathAndUpdateScope(pathNode, this.expressionStatementPath)
                }
            }
        }
    }

    let forStatementTransformer = {
        Identifier(path) {
            let pathParent = path.parent
            let pathNode = path.node

            if (this.undeclaredId === undefined) {
                if ((t.isObjectProperty(pathParent) && pathNode === pathParent.value) ||
                        (t.isArrayPattern(pathParent)) ||
                        (t.isAssignmentPattern(pathParent) && pathNode === pathParent.left)) {

                    if (!this.forStatementPath.scope.hasBinding(pathNode.name)) {
                        let uid = this.forStatementPath.scope.generateUidIdentifier(pathNode.name)
                        insertVariableDeclarationBeforePathAndUpdateScope(uid, this.forStatementPath)
                        this.forStatementPath.traverse(forStatementTransformer,
                                                       {undeclaredId: pathNode,
                                                        declaredId: uid})
                    }
                }
            } else if (this.undeclaredId.name === pathNode.name) {
                path.replaceWith(this.declaredId)
            }
        }
    }

    let forOfStatementTransformer = {
        Identifier(path) {
            let pathParent = path.parent
            let pathNode = path.node

            if (this.undeclaredId === undefined) {
                if ((t.isObjectProperty(pathParent) && pathNode === pathParent.value) ||
                        (t.isArrayPattern(pathParent)) ||
                        (t.isAssignmentPattern(pathParent) && pathNode === pathParent.left)) {

                    if (!this.forOfStatementPath.scope.hasBinding(pathNode.name)) {
                        let uid = this.forOfStatementPath.scope.generateUidIdentifier(pathNode.name)
                        insertVariableDeclarationBeforePathAndUpdateScope(uid, this.forOfStatementPath)
                        this.forOfStatementPath.traverse(forOfStatementTransformer,
                                                         {undeclaredId: pathNode,
                                                          declaredId: uid})
                    }
                }

            } else if (this.undeclaredId.name === pathNode.name) {
                path.replaceWith(this.declaredId)
            }
        }
    }



    let visitorWrapper = {
        visitor: {

            ExpressionStatement(path) {
                if (this.lastPath === undefined) {

                    if (t.isAssignmentExpression(path.node.expression)) {
                        let left = path.node.expression.left
                        if (t.isIdentifier(left)) {
                            if (!path.scope.hasBinding(left.name)) {
                                insertVariableDeclarationBeforePathAndUpdateScope(left, path)
                            }
                        } else { // ArrayPattern, ObjectPattern, etc.
                            let subPath = path.get('expression.left')
                            subPath.traverse(expressionStatementTransformer, {expressionStatementPath: path})
                        }
                        // We have to do this in order for the sibling nodes to see the changes
                        path.parentPath.traverse(visitorWrapper.visitor, {lastPath: path})
                        path.stop()
                    }
                } else if (this.lastPath === path) {
                    delete this.lastPath
                }
            },

            ForStatement(path) {
                if (this.lastPath === undefined) {
                    let init = path.node.init
                    if (t.isAssignmentExpression(init)) {
                        if (t.isIdentifier(init.left)) {
                            if (!path.scope.hasBinding(init.left.name)) {
                                let newInit = t.variableDeclaration('let', [t.variableDeclarator(init.left, init.right)])
                                let newPath = t.forStatement(newInit, path.node.test, path.node.update, path.node.body)
                                path.replaceWith(newPath)
                            }
                        } else { // ArrayPattern, ObjectPattern, etc.
                            let subPath = path.get('init.left')
                            subPath.traverse(forStatementTransformer, {forStatementPath: path})
                        }
                    } else if (t.isSequenceExpression(init)) {
                        for (let i = 0; i < init.expressions.length; i += 1) {
                            let expression = init.expressions[i]

                            if (t.isIdentifier(expression.left)) {
                                if (!path.scope.hasBinding(expression.left.name)) {
                                    let id = expression.left
                                    let uid = path.scope.generateUidIdentifier(id.name)
                                    insertVariableDeclarationBeforePathAndUpdateScope(uid, path)
                                    path.traverse(forStatementTransformer,
                                                  {undeclaredId: id,
                                                   declaredId: uid})
                                }
                            } else { // ArrayPattern, ObjectPattern, etc.
                                let subPath = path.get(`init.expressions.${i}.left`)
                                subPath.traverse(forStatementTransformer, {forStatementPath: path})
                            }
                        }
                    }
                }
            },

            ForOfStatement(path) {
                if (this.lastPath === undefined) {
                    let left = path.node.left

                    if (t.isIdentifier(left)) {
                        if (!path.scope.hasBinding(left.name)) {
                            let newLeft = t.variableDeclaration('let', [t.variableDeclarator(left)])
                            let newPath = t.forOfStatement(newLeft, path.node.right, path.node.body)
                            path.replaceWith(newPath)
                        }
                    } else { // ArrayPattern, ObjectPattern, etc.
                        let subPath = path.get('left')
                        subPath.traverse(forOfStatementTransformer, {forOfStatementPath: path})
                    }
                }
            },

            ForInStatement(path) {
                if (this.lastPath === undefined) {
                    let left = path.node.left
                    if (t.isIdentifier(left) && !path.scope.hasBinding(left.name)) {
                        let newLeft = t.variableDeclaration('let', [t.variableDeclarator(left)])
                        let newPath = t.forInStatement(newLeft, path.node.right, path.node.body)
                        path.replaceWith(newPath)
                    }
                }
            }
        }
    }
    return visitorWrapper
}
