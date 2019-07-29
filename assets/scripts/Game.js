const celerx = require('./celerx');
const _ = require('lodash');

cc.Class({
    extends: cc.Component,

    properties: {
        chessPrefab: {
            default: null,
            type: cc.Prefab
        },
        latestChessPrefab: {
            default: null,
            type: cc.Prefab
        },
        aimPrefab: {
            default: null,
            type: cc.Prefab
        },
        whiteSpriteFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        blackSpriteFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        whiteFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        blackFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        youChess: {
            default: null,
            type: cc.Sprite
        },
        opponentChess: {
            default: null,
            type: cc.Sprite
        },
        timerLabel: {
            default: null,
            type: cc.Label
        },
        youLabel: {
            default: null,
            type: cc.Label
        },
        opponentLabel: {
            default: null,
            type: cc.Label
        },
        youFont: {
            default: null,
            type: cc.Label
        },
        opponentFont: {
            default: null,
            type: cc.Label
        },
        youTurnSprite: {
            default: null,
            type: cc.Sprite
        },
        blueTurnSprite: {
            default: null,
            type: cc.Sprite
        },
        blueTurnFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        chessBoardState: [],
        lastChess: -1,
        myIndex: 0,
        gameState: -1, // -1: not started, 0: game over, 1: black's turn，2: white's turn
        timer: 30,
        lastTouch: -1,
        neverTouch: true,
        judgeHor: {
            default: null,
            type: cc.Prefab
        },
        judgeVer: {
            default: null,
            type: cc.Prefab
        },
        judgeDia: {
            default: null,
            type: cc.Prefab
        },
        judgeAnti: {
            default: null,
            type: cc.Prefab
        },
        guideSprite: {
            default: null,
            type: cc.Node
        },
        coverNode: {
            default: null,
            type: cc.Node
        },
        coverLabel: {
            default: null,
            type: cc.Label
        },
    },

    getJudgePrefab(dir) {
        switch (dir) {
            case 1:
                return this.judgeHor;
            case 2:
                return this.judgeVer;
            case 3:
                return this.judgeDia;
            case 4:
                return this.judgeAnti;
            default:
                return null;
        }
    },

    handleTouch(event) {
        const { target } = event;
        const index = Number(target.name);
        if (this.gameState === this.myIndex && !this.chessBoardState[index]) {
            if (!this.neverTouch) {
                this.guideSprite.setPosition(cc.v2(-1000, -1000));
            } else {
                const nodes = _.keyBy(this.node.children, "name");
                const { x, y } = nodes[index];
                this.guideSprite.setPosition(cc.v2(x, y));
                this.neverTouch = false;
            }
            if (index !== this.lastTouch) {
                this.lastTouch = index;
            } else {
                this.lastTouch = -1;
                this.chessBoardState[index] = this.gameState;
                this.lastChess = index;
                if (this.onchain) {
                    const x = Math.floor(index / 15);
                    const y = index % 15;
                    console.log("call applyAction");
                    this.showCover("Waiting for on-chain confirmation for your move.");
                    celerx.applyAction([x, y], (result) => {
                        console.log("applyAction", result);
                        this.hideCover();
                        this.getOnChainState();
                    });
                    this.gameState = 3 - this.gameState;
                } else {
                    const { winner, mid, dir } = judgeOver(this.chessBoardState);
                    this.displayWinner(mid, dir);
                    this.stopTimer();
                    if (!this.isGameEnd(winner, this.chessBoardState)) {
                        celerx.sendState([winner, this.gameState, this.lessIndex, ...this.chessBoardState]);
                    }
                }
            }
        }
        this.updateUI();
    },

    onLoad() {
        this.chessBoardState = Array(225);
        this.chessBoardState.fill(0);
        for (let y = 0; y < 15; y++) {
            for (let x = 0; x < 15; x++) {
                const newNode = cc.instantiate(this.chessPrefab);
                this.node.addChild(newNode);
                newNode.setPosition(cc.v2(x * 50.5 - 352, y * 50.5 - 482));
                newNode.name = String(y * 15 + x);
                newNode.on(cc.Node.EventType.TOUCH_END, this.handleTouch.bind(this));
            }
        }
        this.latestChess = cc.instantiate(this.latestChessPrefab);
        this.node.addChild(this.latestChess);
        this.aimTouch = cc.instantiate(this.aimPrefab);
        this.node.addChild(this.aimTouch);
        const animationComponet = this.aimTouch.getComponent(cc.Animation);
        const animState = animationComponet.play("aim");
        animState.speed = 0.15;
        animState.repeatCount = Infinity;
    },

    start() {
        const onStateReceived = this.onStateReceived.bind(this);
        const onCourtModeStarted = this.onCourtModeStarted.bind(this);
        celerx.onStateReceived(onStateReceived);
        celerx.onCourtModeStarted(onCourtModeStarted);
        this.onReadyToStart(celerx.getMatch());
        this.hideCover();
        // this.onReadyToStart({
        //     "matchId": "qT-1s38-IDsO-9pRf",
        //     "sharedRandom": 0.1772876067,
        //     "currentPlayer": {
        //         "index": 1,
        //         "id": "...15f9",
        //         "name": "...15f9"
        //     },
        //     "players": [
        //         {
        //             "index": 1,
        //             "id": "...15f9",
        //             "name": "...15f9"
        //         },
        //         {
        //             "index": 2,
        //             "id": "...05c1",
        //             "name": "...05c1"
        //         }
        //     ]
        // });
    },

    onStateReceived(state) {
        this.stopTimer();
        const newState = state.slice(3);
        const { lastChess, result } = isStateValid(newState, this.chessBoardState);
        if (!result) {
            celerx.showCourtModeDialog();
            return false;
        }
        const { winner, mid, dir } = judgeOver(newState);
        this.displayWinner(mid, dir);
        this.isGameEnd(winner, newState);
        this.lastChess = lastChess;
        this.chessBoardState = newState;
        this.updateUI();
        return true;
    },

    onReadyToStart(match) {
        console.log(match);
        celerx.start();
        if (match) {
            const players = _.keyBy(match.players, "index");
            const youInfo = match.currentPlayer;
            const opponentInfo = players[3 - youInfo.index];
            this.youLabel.string = youInfo.name;
            this.opponentLabel.string = opponentInfo.name;
            this.myIndex = youInfo.index;
            this.gameState = 2;
            this.chessBoardState[33] = 1;
            this.onchain = false;
            if (youInfo.index === 1) {
                this.youChess.spriteFrame = this.blackFrame;
                this.opponentChess.spriteFrame = this.whiteFrame;
            } else {
                this.youChess.spriteFrame = this.whiteFrame;
                this.opponentChess.spriteFrame = this.blackFrame;
            }
            this.lessIndex = players[1].id < players[2].id ? 1 : 2;
            this.startTimer();
            this.updateUI();
        }
    },

    getOnChainState() {
        celerx.getOnChainState((state) => {
            console.log("getOnChainState", state);
            const newState = state.slice(3);
            const { lastChess } = isStateValid(newState, this.chessBoardState);
            this.lastChess = lastChess;
            this.chessBoardState = newState;
            this.gameState = (state[0] === 0 || 0) && state[1];
            if (this.gameState > 0) {
                if (this.gameState === this.myIndex) {
                    this.hideCover();
                } else {
                    celerx.getOnChainActionDeadline((deadline) => {
                        console.log(deadline, "getOnChainActionDeadline");
                        const currentBlock = celerx.getCurrentBlockNumber();
                        if (currentBlock > deadline) {
                            if (this.finalize !== deadline) {
                                this.finalize = deadline;
                                console.log("call finalizeOnChainGame");
                                this.showCover("Opponent didn’t respond. We are confirming your victory with blockchain.");
                                celerx.finalizeOnChainGame((result) => {
                                    console.log("finalizeOnChainGame", result);
                                });
                            }
                        } else {
                            this.showCover("Waiting for opponent’s move. This may take a few minutes.");
                        }
                        console.log("getCurrentBlock", currentBlock);
                    });
                    setTimeout(this.getOnChainState.bind(this), 10000);
                }
            }
            this.updateUI();
        });
    },

    onCourtModeStarted() {
        console.log("onchain: ");
        if (!this.onchain) {
            this.onchain = true;
            this.getOnChainState();
            this.timerLabel.string = "";
        }
        return true;
    },

    counting() {
        const state = [3 - this.myIndex, this.gameState, this.lessIndex, ...this.chessBoardState];
        if (this.gameState === this.myIndex) {
            if (this.timer) {
                this.timer--;
            } else {
                this.stopTimer();
                if (amountOfChess(this.chessBoardState) < 5) {
                    celerx.draw(state);
                } else {
                    console.log("surrender");
                    celerx.surrender(state);
                }
            }
            if (this.timer === 5) {
                const animationComponet = this.youTurnSprite.getComponent(cc.Animation);
                const animState = animationComponet.play("shanhong");
                animState.speed = 0.25;
                animState.repeatCount = Infinity;
            }
        } else {
            if (this.timer) {
                this.timer--;
            }
            if (this.oppTimer) {
                this.oppTimer--;
            } else {
                this.stopTimer();
                if (amountOfChess(this.chessBoardState) < 5) {
                    celerx.draw(state);
                } else {
                    console.log("shouldTriggerDispute");
                    celerx.showCourtModeDialog();
                }
            }
        }
        this.timerLabel.string = `00:${this.timer < 10 ? `0${this.timer}` : this.timer}`;
    },

    startTimer() {
        this.timer = 30;
        this.oppTimer = 35;
        this.youTurnSprite.spriteFrame = null;
        this.schedule(this.counting, 1);
        this.updateUI();
    },

    stopTimer() {
        const animationComponet = this.youTurnSprite.getComponent(cc.Animation);
        animationComponet.stop('shanhong');
        this.youTurnSprite.spriteFrame = null;
        this.unschedule(this.counting);
    },

    isGameEnd(winner, boardState) {
        const state = [winner, 3 - this.gameState, this.lessIndex, ...boardState];
        if (winner) {
            if (winner === this.myIndex) {
                celerx.win(state);
            } else {
                celerx.lose(state);
            }
            this.gameState = 0;
        } else if (boardState.indexOf(0) < 0) {
            celerx.draw(state);
            this.gameState = 0;
        } else {
            this.gameState = 3 - this.gameState;
            this.startTimer();
            return false;
        }
        return true;
    },

    updateUI() {
        this.aimTouch.x = -10000;
        this.latestChess.x = -10000;
        const nodes = _.keyBy(this.node.children, "name");
        this.chessBoardState.forEach((value, index) => {
            const node = nodes[index];
            const component = node.getComponent(cc.Sprite);
            switch (value) {
                case 1:
                    component.spriteFrame = this.blackSpriteFrame;
                    break;
                case 2:
                    component.spriteFrame = this.whiteSpriteFrame;
                    break;
                default:
                    component.spriteFrame = null;
            }
            if (index === this.lastChess) {
                this.latestChess.setPosition(cc.v2(node.x, node.y));
            }
            if (index === this.lastTouch) {
                this.aimTouch.setPosition(cc.v2(node.x, node.y));
            }
        });
        if (this.gameState > 0) {
            this.blueTurnSprite.spriteFrame = this.blueTurnFrame;
            if (this.gameState === this.myIndex) {
                this.blueTurnSprite.node.x = -68;
                this.blueTurnSprite.node.scaleX = 1;
                this.youFont.node.color = new cc.color(81, 214, 247, 255);
                this.opponentFont.node.color = new cc.color(0, 0, 0, 255);
            } else {
                this.blueTurnSprite.node.x = 68;
                this.blueTurnSprite.node.scaleX = -1;
                this.youFont.node.color = new cc.color(0, 0, 0, 255);
                this.opponentFont.node.color = new cc.color(81, 214, 247, 255);
            }
        }
    },

    displayWinner(mid, dir) {
        if (dir) {
            const nodes = _.keyBy(this.node.children, "name");
            let prefab = this.getJudgePrefab(dir);
            const { x, y } = nodes[mid];
            const newNode = cc.instantiate(prefab);
            this.node.addChild(newNode);
            newNode.setPosition(cc.v2(x, y));
        }
    },

    showCover(str) {
        this.coverNode.active = true;
        this.coverLabel.string = str;
    },

    hideCover() {
        this.coverNode.active = false;
    }
});

function isStateValid(newState, oldState) {
    let lastChess, diff = 0;
    for (let i = 0; i < newState.length; i++) {
        if (oldState[i] !== newState[i]) {
            lastChess = i;
            diff++;
        }
    }
    return { lastChess, result: diff === 1 };
}

function whoWin(arr) {
    let one = 0, two = 0, last = 0;
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] === last) {
            if (arr[i] === 1) {
                one++;
            } else if (arr[i] === 2) {
                two++;
            }
        } else {
            one = 0;
            two = 0;
        }
        if (one > 3) {
            return { winner: 1, mid: i - 2 };
        }
        if (two > 3) {
            return { winner: 2, mid: i - 2 };
        }
        last = arr[i];
    }
    return { winner: 0 };
}

function judgeOver(chessBoardState) {
    for (let i = 0; i < 15; i++) {
        const arr = chessBoardState.slice(i * 15, 15 * i + 15);
        const { winner, mid } = whoWin(arr);
        if (winner) {
            return { winner, mid: i * 15 + mid, dir: 1 };
        }
    }
    for (let i = 0; i < 15; i++) {
        const arr = [];
        for (let j = 0; j < 15; j++) {
            arr.push(chessBoardState[i + 15 * j]);
            const { winner, mid } = whoWin(arr);
            if (winner) {
                return { winner, mid: mid * 15 + i, dir: 2 };
            }
        }
    }
    for (let i = 0; i < 15; i++) {
        const arr = [];
        const brr = [];
        const crr = [];
        const drr = [];
        for (let j = 0; j < 15 - i; j++) {
            arr.push(chessBoardState[i + 16 * j]);
            brr.push(chessBoardState[14 - i + 14 * j]);
            crr.push(chessBoardState[224 - i - 16 * j]);
            drr.push(chessBoardState[210 + i - 14 * j]);
        }
        let result = whoWin(arr);
        if (result.winner) {
            const { winner, mid } = result;
            return { winner, mid: i + 16 * mid, dir: 3 };
        }
        result = whoWin(brr);
        if (result.winner) {
            const { winner, mid } = result;
            return { winner, mid: 14 - i + 14 * mid, dir: 4 };
        }
        result = whoWin(crr);
        if (result.winner) {
            const { winner, mid } = result;
            return { winner, mid: 224 - i - 16 * mid, dir: 3 };
        }
        result = whoWin(drr);
        if (result.winner) {
            const { winner, mid } = result;
            return { winner, mid: 210 + i - 14 * mid, dir: 4 };
        }
    }
    return { winner: 0 };
}

function amountOfChess(chessBoardState) {
    let count = 0;
    for (let i = 0; i < chessBoardState.length; i++) {
        if (chessBoardState[i]) count++;
    }
    return count;
}
