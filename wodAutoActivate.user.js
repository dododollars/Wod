// ==UserScript==
// @name         WOD分团队自动激活
// @namespace    https://github.com/dododollars
// @version      2025.08.05 test log
// @description  根据团队分组并自动激活插件
// @author       DoDoDollars
// @updateURL    https://github.com/dododollars/Wod/raw/refs/heads/main/wodAutoActivate.user.js
// @downloadURL  https://github.com/dododollars/Wod/raw/refs/heads/main/wodAutoActivate.user.js
// @grant        none
// @match        http*://*.world-of-dungeons.org/wod/spiel/settings/heroes.php*
// ==/UserScript==

(function () {
  'use strict';
  const GADGET_TIMEOUT = 10*1000; //gadgetNextdungeonTime页面元素加载超时时间10秒
  const MAIN_TEAM_RESERVE_TIME = 5*60*1000; //若主队还有5分钟即将结算就等结算后再执行接下来操作
  const RELOAD_WAIT_TIME = 3*1000; //页面刷新等待时间3秒
  const SCRIPT_CHECK_TIME = 29*1000; //脚本执行间隔时间29秒
  const REQUEST_TIME_INTERVAL = 3*1000; //执行刷新请求寻找下一地城时间间隔
  const REQUEST_TIME_TIMEOUT = 2*MAIN_TEAM_RESERVE_TIME; //执行刷新请求寻找下一地城时间间隔
  const CHECK_BUTTON_TIME = 1000; //检查按下开始按钮的间隔时间1秒
  const ACTIVE_RESERVE_TIME = 3*60*1000; //提前3分钟激活等待, 不能大于MAIN_TEAM_RESERVE_TIME主队等待时间的预留时间
  const FETCHALL_TIMEOUT = 2*60*1000; //清包的超时时间
  const FETCHALL_INTERVAL = 1000; //清包的检测文本间隔时间,不能大于3秒
	
  let entry_main = []; // int[]
  let entry_team = []; // [{id：int, text:string, nowRow:int, row:int:[]}]
  let entry_hero = []; // [{id：int, name:string}]
  let entry_proxy = [];
  let nowActivate = null; // int
  let activate = []; // int[]
  let mainRow = [];
  let scriptStartTime = 0;
  let ifActive = false;
  let sign = "";

  const STORAGE_KEY_TIME_MINI = "entry_time_mini";
  const STORAGE_KEY_TIME_MAIN = "entry_time_main";
  const STORAGE_KEY_TEAM = "wod_entry_team";
  const STORAGE_KEY_HERO = "wod_entry_hero";
  const STORAGE_KEY_MAIN = "wod_entry_main";
  const STORAGE_KEY_PROXY = "wod_entry_proxy";
  const STORAGE_KEY_STARTTIME = "wod_script_startTime";
  const STORAGE_KEY_SCRIPT = "wod_script_ifActive";
  const STORAGE_KEY_SIGN = "wod_script_sign";

  function loadFromStorage(type) {
    try {
      if (!type || type === "TEAM") {
        entry_team = JSON.parse(localStorage.getItem(STORAGE_KEY_TEAM) || '[]');
      }
    } catch (e) {
      console.warn("解析 entry_team 失败：", e);
    }

    try {
      if (!type || type === "HERO") {
        entry_hero = JSON.parse(localStorage.getItem(STORAGE_KEY_HERO) || '[]');
      }
    } catch (e) {
      console.warn("解析 entry_hero 失败：", e);
    }

    try {
      if (!type || type === "MAIN") {
        entry_main = JSON.parse(localStorage.getItem(STORAGE_KEY_MAIN) || '[]');
      }
    } catch (e) {
      console.warn("解析 entry_main 失败：", e);
    }

    try {
      if (!type || type === "PROXY") {
        entry_proxy = JSON.parse(localStorage.getItem(STORAGE_KEY_PROXY) || '[]');
      }
    } catch (e) {
      console.warn("解析 entry_proxy 失败：", e);
    }
    try {
      if (!type || type === "STORAGE_KEY_STARTTIME") {
        scriptStartTime = JSON.parse(localStorage.getItem(STORAGE_KEY_STARTTIME) || 0);
      }
    } catch (e) {
      console.warn("解析 scriptStartTime 失败：", e);
    }
    try {
      if (!type || type === "STORAGE_KEY_SCRIPT") {
        ifActive = JSON.parse(localStorage.getItem(STORAGE_KEY_SCRIPT) || 'false');
      }
    } catch (e) {
      console.warn("解析 ifActive 失败：", e);
    }
	try {
      if (!type || type === "STORAGE_KEY_SIGN") {
        const signData = localStorage.getItem(STORAGE_KEY_SIGN) || null;
		sign = signData ? JSON.parse(signData) : "";
      }
    } catch (e) {
      console.warn("解析 sign 失败：", e);
    }
  }

  function saveToStorage() {
    localStorage.setItem(STORAGE_KEY_TEAM, JSON.stringify(entry_team));
    localStorage.setItem(STORAGE_KEY_HERO, JSON.stringify(entry_hero));
    localStorage.setItem(STORAGE_KEY_MAIN, JSON.stringify(entry_main));
    localStorage.setItem(STORAGE_KEY_PROXY, JSON.stringify(entry_proxy));
  }

  function populateSelect($select) {
    $select.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.textContent = "新建激活小队";
    defaultOption.value = "0";
    $select.appendChild(defaultOption);

    entry_team.forEach(team => {
      const option = document.createElement("option");
      option.value = team.id;
      option.textContent = `${team.id}. ${team.text}`;
      $select.appendChild(option);
    });
  }

  const $h1 = document.querySelector("#clock");
  if ($h1) {
    loadFromStorage();

    const $wrapper = document.createElement("div");
    $wrapper.style.marginLeft = "8px";
    $wrapper.style.display = "inline-block";

    const $select = document.createElement("select");
    $select.id = "activateGroupSelect";
    $wrapper.appendChild($select);

    const $btnWrite = createBtn("写入", true);
    const $btnDelete = createBtn("删除");
    const $btnMain = createBtn("大团");
    const $btnSub = createBtn("Mini");
    const $btnStart = createBtn("开始", true);
    const $btnStop = createBtn("停止", true);

    [$btnWrite, $btnDelete, $btnMain, $btnSub, $btnStart, $btnStop].forEach(btn => {
      btn.style.marginLeft = "2px";
      $wrapper.appendChild(btn);
    });
    const signSpan = document.createElement("span");
    signSpan.id = "signDisplay";
    signSpan.style.marginLeft = "8px";
    signSpan.style.fontWeight = "bold";
    signSpan.textContent = sign;
    $wrapper.appendChild(signSpan);

    function createBtn(text, alwaysVisible = false) {
      const btn = document.createElement("button");
      btn.textContent = text;
      btn.style.display = alwaysVisible ? "inline-block" : "none";
      btn.dataset.label = text;
      return btn;
    }

    function refreshSelect() {
      $select.innerHTML = "";
      const defaultOption = document.createElement("option");
      defaultOption.textContent = "新建激活小队";
      defaultOption.value = "0";
      $select.appendChild(defaultOption);

      entry_team.forEach(team => {
        const option = document.createElement("option");
        option.value = team.id;
        option.textContent = `${team.id}. ${team.text}`;
        const isMain = entry_main.includes(team.id);
        option.style.color = isMain ? "blue" : "darkred";
        option.style.fontWeight = isMain ? "bold" : "normal";
        $select.appendChild(option);
      });

      updateBtnVisibility();
    }

    function updateBtnVisibility() {
      const id = parseInt($select.value);
      const team = entry_team.find(t => t.id === id);
      if (!team) {
        $btnMain.style.display = "none";
        $btnSub.style.display = "none";
        $btnDelete.style.display = "none";
        return;
      }
      const isMain = entry_main.includes(team.id);
      $btnMain.style.display = isMain ? "none" : "inline-block";
      $btnSub.style.display = isMain ? "inline-block" : "none";
      $btnDelete.style.display = "inline-block";
    }

    $select.addEventListener("change", () => updateBtnVisibility());

    $btnWrite.onclick = () => {
      const id = parseInt($select.value);
      saveTeam(id, {
        nowRow: nowActivate,
        row: [...activate]
      });
      refreshSelect();
      updateBtnVisibility();
    };

    $btnDelete.onclick = () => {
      const selectedId = parseInt($select.value);
      if (isNaN(selectedId)) return;

      entry_team = entry_team.filter(e => e.id !== selectedId);

      if (Array.isArray(entry_main)) {
        entry_main = entry_main.filter(id => id !== selectedId);
        localStorage.setItem(STORAGE_KEY_MAIN, JSON.stringify(entry_main));
      }

      entry_team.forEach(e => {
        if (e.id > selectedId) e.id -= 1;
      });

      if (Array.isArray(entry_main)) {
        entry_main = entry_main.map(id => (id > selectedId ? id - 1 : id));
        localStorage.setItem(STORAGE_KEY_MAIN, JSON.stringify(entry_main));
      }

      localStorage.setItem(STORAGE_KEY_TEAM, JSON.stringify(entry_team));
      refreshSelect();
    };

    $btnMain.onclick = () => {
      const id = parseInt($select.value);
      const team = entry_team.find(t => t.id === id);
      if (!team) return;

      const isAlreadyMain = entry_main?.includes(id);

      if (!isAlreadyMain) {
        const totalMemberCount = (entry_main ?? [])
          .map(mid => {
            const mteam = entry_team.find(t => t.id === mid);
            return mteam?.row ?? [];
          })
          .concat([team.row ?? []])
          .reduce((sum, r) => sum + r.length, 0);

        const confirmSet = confirm(`请确定最大激活数能覆盖所有主队成员数量※ 共 ${totalMemberCount}人 ※，是否仍要设置该队为主队？`);
        if (!confirmSet) return;

        entry_main = [...(entry_main ?? []), id];
      } else {
        entry_main = entry_main.filter(mid => mid !== id);
      }

      saveToStorage();
      refreshSelect();
      $select.value = id;
      updateBtnVisibility();
    };

    $btnSub.onclick = () => {
      const id = parseInt($select.value);
      const team = entry_team.find(t => t.id === id);
      if (!team) return;

      entry_main = (entry_main ?? []).filter(mainId => mainId !== id);
      saveToStorage();
      refreshSelect();
      $select.value = id;
      updateBtnVisibility();
    };

    $btnStart.onclick = () => {
      localStorage.removeItem('entry_time_mini');
      localStorage.removeItem('entry_time_main');
      localStorage.removeItem('WOD_LOG');
	  localStorage.removeItem(STORAGE_KEY_SIGN);
      ifActive = true;
      localStorage.setItem(STORAGE_KEY_SCRIPT, JSON.stringify(true));
      updateSignDisplay("脚本启动中!");
	  sign='';
    };

    $btnStop.onclick = () => {
      console.log("日志:", JSON.parse(localStorage.getItem("WOD_LOG") || "[]"));
      updateSignDisplay("脚本将在3秒后结束!");
      ifActive = false;
      localStorage.setItem(STORAGE_KEY_SCRIPT, JSON.stringify(false));
      localStorage.removeItem('entry_time_mini');
      localStorage.removeItem('entry_time_main');
      //localStorage.removeItem('WOD_LOG');
	  localStorage.removeItem(STORAGE_KEY_SIGN);
	  sign='';
    };

    refreshSelect();
    updateBtnVisibility();
    $h1.parentNode.insertBefore($wrapper, $h1.nextSibling);
  }

  function updateSignDisplay(txt) {
    const el = document.querySelector("#signDisplay");
    if (el) {
	  if (typeof txt === 'string' && txt !== '') {
		el.textContent = txt;
	  }else{
		el.textContent = sign;
	  }

    }
  }

  function saveTeam(id, entry1) {
    const isNew = (id === 0 || isNaN(id));
    let entryOld = {};
    if (!isNew) {
      const teamList = JSON.parse(localStorage.getItem(STORAGE_KEY_TEAM) || '[]');
      entryOld = teamList[id - 1];
    }

    const text = prompt(
      isNew ? "请输入新分组名称：" : "请输入要覆盖的分组名称：",
      isNew ? "" : entryOld.text || ""
    );

    if (!text) {
      alert("写入取消");
      return;
    }

    const realId = isNew ? (entry_team.length + 1) : id;
    const team = {
      id: realId,
      text: text,
      nowRow: entry1.nowRow,
      row: entry1.row
    };

    if (isNew) {
      entry_team.push(team);
    } else {
      const index = entry_team.findIndex(t => t.id === id);
      if (index !== -1) {
        entry_team[index] = team;
      } else {
        entry_team.push(team);
      }
    }

    saveToStorage();
    console.table(entry_team);
  }

  function processEntry(entry) {
    const now = new Date();
    const entryDate = new Date(entry.DateStr);

    const isSameDay =
      now.getFullYear() === entryDate.getFullYear() &&
      now.getMonth() === entryDate.getMonth() &&
      now.getDate() === entryDate.getDate();

    if (isSameDay && typeof entry.timeStr === 'string') {
      entry.timeStr = entry.timeStr.replace(/^明天\s*/, '');
    }

    return entry;
  }

  function readHeroTable() {
    const tbody = document.querySelector("table.content_table > tbody");
    if (!tbody) {
      console.warn("找不到 <tbody>");
      return;
    }

    const rows = tbody.querySelectorAll("tr");
    entry_hero = [];
    activate = [];
    let rowNum = 1;

    for (let i = 0; i < rows.length ; i++) {
      const tr = rows[i];
      if (i === 0) continue;

      const tds = tr.querySelectorAll("td");
      if (tds.length < 5) continue; // 表格总共5列

      const radio = tds[0].querySelector("input[type='radio']");
      if (radio?.checked) {
        nowActivate = rowNum;
      }

      const name = tds[0].querySelector("a")?.textContent?.trim() || `row${rowNum}`;
      const checkbox = tds[3].querySelector("input[type='checkbox']");
      let include = false;
      if (checkbox?.checked) include = true;

      entry_hero.push({
        row: rowNum,
        name
      });
      if (include) {
        activate.push(rowNum);
      }

      rowNum++;
    }

    saveToStorage();
    console.table(entry_hero);
  }

  function parseTime(text) {
    const now = new Date();
    let [hour, minute] = [0, 0];
    const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      hour = parseInt(timeMatch[1], 10);
      minute = parseInt(timeMatch[2], 10);
    }

    if (text.includes("明天")) {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(hour, minute, 0, 0);
      return d.getTime();
    } else if (text.includes("立刻") || text.includes("现在")) {
      return now.getTime();
    } else {
      const d = new Date(now);
      d.setHours(hour, minute, 0, 0);
      return d.getTime();
    }
  }

  function sortEntryBytimeStr(entries) {
    return [...entries].sort((a, b) => {
      const timeA = parseTime(a.timeStr);
      const timeB = parseTime(b.timeStr);
      return timeA - timeB;
    });
  }

  function clearAllChecked() {
    const tbody = document.querySelector("table.content_table > tbody");
    if (!tbody) return;
    const inputs = tbody.querySelectorAll("input[checked]");
    inputs.forEach(input => {
      input.removeAttribute("checked");
      input.checked = false;
    });
  }

  function clickButtonByName(value) {
    const button = document.querySelector(
      `button#${CSS.escape(value)}, input#${CSS.escape(value)}, button[name="${value}"], input[name="${value}"]`
    );
    if (button) {
      button.click();
    }
  }

  function setActivate(rows) {
    const tbody = document.querySelector("table.content_table > tbody");
    if (!tbody) return;
    const trList = tbody.querySelectorAll("tr");
    rows.forEach(index => {
      const tr = trList[index];
      if (tr) {
        const checkbox = tr.querySelectorAll("td")[3]?.querySelector("input[type='checkbox']");
        if (checkbox) {
          checkbox.setAttribute("checked", "");
          checkbox.checked = true;
        }
      }
    });
  }

  function setNowActivate(index) {
    const tbody = document.querySelector("table.content_table > tbody");
    if (!tbody) return;
    const tr = tbody.querySelectorAll("tr")[index];
    if (tr) {
      const radio = tr.querySelectorAll("td")[0]?.querySelector("input[type='radio']");
      if (radio) {
        radio.setAttribute("checked", "");
        radio.checked = true;
      }
    }
  }

  function setDungeon() {
    const normalRadio = document.querySelector('input[type="radio"][name="fast_dungeon_type"][value="normal"]');
    const limitRadio = document.querySelector('input[type="radio"][name="fast_dungeon_type"][value="limit"]');

    if (normalRadio) normalRadio.checked = true;
    if (limitRadio) limitRadio.checked = false;

    const select = document.querySelector('select[name="fast_dungeon_select"]');
    if (select && select.options.length >= 2) {
      select.selectedIndex = 1;
    }
    clickButtonByName("gotoTravel");
  }

  function getActivateState() {
    const tbody = document.querySelector("table.content_table > tbody");
    if (!tbody) return { nowRow: -1, row: [] };

    const trList = tbody.querySelectorAll("tr");
    const result = {
      nowRow: -1,
      row: []
    };

    trList.forEach((tr, index) => {
      const radio = tr.querySelectorAll("td")[0]?.querySelector("input[type='radio']");
      if (radio && radio.checked) {
        result.nowRow = index;
      }

      const checkbox = tr.querySelectorAll("td")[3]?.querySelector("input[type='checkbox']");
      if (checkbox && checkbox.checked) {
        result.row.push(index);
      }
    });

    return result;
  }

  function log4js(...args) {
    const key = "WOD_LOG";

    let logs;
    try {
      logs = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(logs)) logs = [];
    } catch (e) {
      console.error("log4js: localStorage parse failed", e);
      logs = [];
    }

    const now = new Date();
    function pad(n) {
      return n < 10 ? '0' + n : n;
    }
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    for (const arg of args) {
      let content;
      try {
        content = (typeof arg === "object" && arg !== null) ? JSON.stringify(arg) : String(arg);
      } catch (e) {
        content = "[Unserializable Argument]";
      }

      const line = `[${timestamp}] ${content}`;
      logs.push(line);
      //console.log(line);
    }

    try {
      localStorage.setItem(key, JSON.stringify(logs));
    } catch (e) {
      console.error("log4js: localStorage write failed", e);
    }
  }

  function sortEntriesByDate(entries) {
    return [...entries].sort((a, b) => {
      const timestampA = parseDatetimeToTimestamp(a.DateStr);
      const timestampB = parseDatetimeToTimestamp(b.DateStr);
      return timestampA - timestampB;
    });
  }

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const yyyy = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const HH = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
  }

  function parseDatetimeToTimestamp(datetimeStr) {
    const parts = datetimeStr.split(/[- :]/);
    const [yyyy, MM, dd, HH, mm, ss] = parts.map(Number);
    const date = new Date(yyyy, MM - 1, dd, HH, mm, ss);
    return date.getTime();
  }

  function waitForElement(selector, timeout = GADGET_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error('Timeout: ' + selector));
      }, timeout);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          clearTimeout(timer);
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  async function main() {
    if (ifActive === true) {
      const HERO_COMPARE_KEY = 'wod_entry_hero';
      const STORAGE_KEY_TIME_MAIN = 'entry_time_main';
      const STORAGE_KEY_TIME_MINI = 'entry_time_mini';

      let entry_time_main = JSON.parse(localStorage.getItem(STORAGE_KEY_TIME_MAIN) || 'null');
      let entry_time_mini = JSON.parse(localStorage.getItem(STORAGE_KEY_TIME_MINI) || 'null');

      if (!entry_time_main) {
        entry_time_main = entry_main.map(id => ({ teamId: id, timeStr: '', DateStr: '' }));
      } else {
        entry_time_main = entry_time_main.map(entry => processEntry(entry));
        localStorage.setItem(STORAGE_KEY_TIME_MAIN, JSON.stringify(entry_time_main));
      }

      if (!entry_time_mini) {
        entry_time_mini = entry_team
          .filter(t => !entry_main.includes(t.id))
          .map(t => ({ teamId: t.id, timeStr: '', DateStr: '' }));
      } else {
        entry_time_mini = entry_time_mini.map(entry => processEntry(entry));
        localStorage.setItem(STORAGE_KEY_TIME_MINI, JSON.stringify(entry_time_mini));
      }

      entry_main.forEach(id => {
        const team = entry_team.find(t => t.id === id);
        if (team) mainRow = mainRow.concat(team.row);
      });

      async function handleMainEntry(i) {
        if (i >= entry_time_main.length) {
          entry_time_main = sortEntriesByDate(entry_time_main);
          let timeDiff = (parseDatetimeToTimestamp(entry_time_main[0].DateStr) - Date.now());
          //console.log("mainTeam最早时间跟现在的时间差为：", timeDiff);
          if (MAIN_TEAM_RESERVE_TIME < timeDiff) {
            return await handleMiniEntry(0);
          } else {
            try {
              const result = await waitForNextDungeonTime();
              log4js("成功获取新时间:", result);
              entry_time_main[0].timeStr = '';
              entry_time_main[0].DateStr = '';
			  //console.log("当前主队为",entry_time_main);
              localStorage.setItem(STORAGE_KEY_TIME_MAIN, JSON.stringify(entry_time_main));
			  location.reload();
            } catch (error) {
              console.error("操作失败:", error);
              log4js("操作失败:", error);
              entry_time_main[0].timeStr = '';
              entry_time_main[0].DateStr = '';
              localStorage.setItem(STORAGE_KEY_TIME_MAIN, JSON.stringify(entry_time_main));
			  location.reload();
            }
          }
        }

        const entry = entry_time_main[i];
        if (entry.timeStr !== '') { return await handleMainEntry(i + 1) };

        const team = entry_team.find(t => t.id === entry.teamId);
        if (!team) return await handleMainEntry(i + 1);

        const nowActive = getActivateState();
        const alreadySet = mainRow.every(r => nowActive.row.includes(r)) &&
          team.row.includes(nowActive.nowRow);

        async function proceedAfterRefresh(i, entry, team) {
          //console.log("进入 proceedAfterRefresh");
          await sleep(RELOAD_WAIT_TIME);

          try {
            await waitForElement("#htmlComponentStats", GADGET_TIMEOUT);
            const gadgetElem = document.querySelector("#gadgetNextdungeonTime");

            if (!gadgetElem) {
              setDungeon();
              await waitForElement("#gadgetNextdungeonTime", GADGET_TIMEOUT);
              return await handleMainEntry(i);
            }
            //console.log("找到了 gadget: ", gadgetElem?.innerText);
            entry.timeStr = gadgetElem.innerText;
            entry.DateStr = formatTimestamp(parseTime(entry.timeStr));
            localStorage.setItem(STORAGE_KEY_TIME_MAIN, JSON.stringify(entry_time_main));

            try {
              log4js("main方法执行一次, entry_time_main目前为:", entry_time_main);
            } catch (e) {
              console.error("log4js 执行异常", e);
            }
            return await handleMainEntry(i + 1);
          } catch (err) {
            console.warn("等待超时", err);
            return await handleMainEntry(i);
          }
        }

        if (alreadySet) {
          return await proceedAfterRefresh(i, entry, team);
        } else {
          clearAllChecked();
          setActivate(mainRow);
          setNowActivate(team.nowRow);
          clickButtonByName("ok");
        }
      }

      async function handleMiniEntry(j) {
        if (j >= entry_time_mini.length) {
          entry_time_mini = sortEntriesByDate(entry_time_mini);
          log4js("全部角色时间获取完成, entry_time_main, entry_time_main依次为:", entry_time_main, entry_time_main);
          let nextDungeon = getNextDungeon(entry_time_main, entry_time_mini);

          if (nextDungeon !== null) {
            waitForNextDungeon(nextDungeon);
          } else {

			const nowActive = getActivateState();
            const alreadySet = mainRow.every(r => nowActive.row.includes(r)) && mainRow.includes(nowActive.nowRow);
			if(!alreadySet){
				updateSignDisplay("预留时间内无地城结算, 即将激活主队");
				log4js("ACTIVE_RESERVE_TIME预留时间内无地城结算, 即将激活主队");
				await sleep(SCRIPT_CHECK_TIME);
				clearAllChecked();
				setActivate(mainRow);
				setNowActivate(mainRow[0]);
				clickButtonByName("ok");
			}else{
				log4js("ACTIVE_RESERVE_TIME预留时间内无地城结算, 主队已激活");
            //console.log("日志:", JSON.parse(localStorage.getItem("WOD_LOG") || "[]"));
				await sleep(SCRIPT_CHECK_TIME);
                location.reload();
			}


          }
          return;
        }

        const entry = entry_time_mini[j];
        if (entry.timeStr !== '') return await handleMiniEntry(j + 1);

        const team = entry_team.find(t => t.id === entry.teamId);
        if (!team) return await handleMiniEntry(j + 1);

        const nowActive = getActivateState();
        const alreadySet =
          team.row.every(r => nowActive.row.includes(r)) &&
          team.row.includes(nowActive.nowRow);

        async function proceedAfterRefreshMini(j, entry, team) {
          //console.log("进入 proceedAfterRefreshMini");
          await sleep(RELOAD_WAIT_TIME);

          try {
            await waitForElement("#htmlComponentStats", GADGET_TIMEOUT);
            const gadgetElem = document.querySelector("#gadgetNextdungeonTime");

            if (!gadgetElem) {
              setDungeon();
              await waitForElement("#gadgetNextdungeonTime", GADGET_TIMEOUT);
              return await handleMiniEntry(j);
            }

            entry.timeStr = gadgetElem.innerText;
            entry.DateStr = formatTimestamp(parseTime(entry.timeStr));
            localStorage.setItem(STORAGE_KEY_TIME_MINI, JSON.stringify(entry_time_mini));

            try {
              log4js("mini方法执行一次, entry_time_mini目前为:", entry_time_mini);
            } catch (e) {
              console.error("log4js 执行异常", e);
            }

            return await handleMiniEntry(j + 1);
          } catch (err) {
            console.warn("等待超时", err);
            return await handleMiniEntry(j);
          }
        }

        if (alreadySet) {
          return await proceedAfterRefreshMini(j, entry, team);
        } else {
          clearAllChecked();
          setActivate(team.row);
          setNowActivate(team.nowRow);
          clickButtonByName("ok");
        }
      }

      await handleMainEntry(0);
    } else {
      await sleep(CHECK_BUTTON_TIME);
      await main();
    }
  }

  function getNextDungeon(entry_main, entry_mini) {
    const mainEarliest = entry_main[0];
    const miniEarliest = entry_mini[0];

    if (!mainEarliest && !miniEarliest) return null;
    if (!mainEarliest) return checkTime(miniEarliest);
    if (!miniEarliest) return checkTime(mainEarliest);

    const mainTime = parseDatetimeToTimestamp(mainEarliest.DateStr);
    const miniTime = parseDatetimeToTimestamp(miniEarliest.DateStr);

    let selectedEntry;
    if (mainTime > miniTime && (mainTime - miniTime) <= MAIN_TEAM_RESERVE_TIME) {
      selectedEntry = mainEarliest;
    } else {
      selectedEntry = mainTime < miniTime ? mainEarliest : miniEarliest;
    }
    log4js("下一个最早地城为:", selectedEntry);
	localStorage.setItem(STORAGE_KEY_SIGN, JSON.stringify("下一队伍为:" + (entry_team.find(item => item.id === selectedEntry.teamId)).text+" ,结算时间为:"+selectedEntry.DateStr));
	updateSignDisplay();
    return checkTime(selectedEntry);
  }

  function checkTime(entry) {
    if (!entry) return null;
    const now = Date.now();
    const entryTime = parseDatetimeToTimestamp(entry.DateStr);
    const timeDiff = entryTime - now;

    if (timeDiff <= ACTIVE_RESERVE_TIME) {
      return entry;
    }
    return null;
  }

  function checkAndSaveHeroTable() {
    const storedHero = loadFromStorage("HERO") || [];
    const entryHeroFromPage = readHeroTable();
    const mismatch = entryHeroFromPage.some((hero, idx) => {
      return !storedHero[idx] || hero.name !== storedHero[idx].name;
    });

    if (mismatch) {
      const confirmReset = confirm("角色名称改变，脚本启动失败。点击确定清除全部存储内容，取消则终止。");
      if (confirmReset) {
        localStorage.clear();
      }
      return;
    }
    log4js("STEP1已完成");
  }

  async function waitForNextDungeon(entry) {
    const nowActive = getActivateState();
    const team = entry_team.find(t => t.id === entry.teamId);
    const alreadySet =
      team.row.every(r => nowActive.row.includes(r)) &&
      team.row.includes(nowActive.nowRow);
    if (alreadySet) {
      try {
        const result = await waitForNextDungeonTime();
        log4js("检测到新文本,结算成功!!!即将删除DateStr清包后并刷新页面", result);
        try {
          clickButtonByName("fetchAll");
		  await sleep(FETCHALL_INTERVAL);
          const disappeared = await waitTillAwesomeTipsFinish(FETCHALL_TIMEOUT);
          //console.log("清包成功", disappeared);
        } catch (error) {
          console.error("清包失败:", error);
          location.reload();
        }
        deleteDateStr(entry);
        location.reload();
      } catch (error) {
        console.error("操作失败:", error);
        try {
          clickButtonByName("fetchAll");
          const disappeared = await aitTillAwesomeTipsFinish(FETCHALL_TIMEOUT);
		  await sleep(FETCHALL_INTERVAL);
          //console.log("清包成功", disappeared);
        } catch (error) {
          console.error("清包失败:", error);
          location.reload();
        }
        deleteDateStr(entry);
        location.reload();
      }
    } else {
      clearAllChecked();
      setActivate(team.row);
      setNowActivate(team.nowRow);
      clickButtonByName("ok");
    }
  }

  function deleteDateStr(entry) {
    if (entry_main.includes(entry.teamId)) {
      let entry_time_main = JSON.parse(localStorage.getItem(STORAGE_KEY_TIME_MAIN) || '[]');
      const index = entry_time_main.findIndex(t => t.teamId === entry.teamId);
      if (index !== -1) {
        const updatedEntryTimeMain = [
          ...entry_time_main.slice(0, index),
          {
            ...entry_time_main[index],
            DateStr: '',
            timeStr: ''
          },
          ...entry_time_main.slice(index + 1)
        ];
        localStorage.setItem(STORAGE_KEY_TIME_MAIN, JSON.stringify(updatedEntryTimeMain));
      }
    } else {
      let entry_time_mini = JSON.parse(localStorage.getItem(STORAGE_KEY_TIME_MINI) || '[]');
      const index = entry_time_mini.findIndex(t => t.teamId === entry.teamId);
      if (index !== -1) {
        const updatedEntryTimeMini = [
          ...entry_time_mini.slice(0, index),
          {
            ...entry_time_mini[index],
            DateStr: '',
            timeStr: ''
          },
          ...entry_time_mini.slice(index + 1)
        ];
        localStorage.setItem(STORAGE_KEY_TIME_MINI, JSON.stringify(updatedEntryTimeMini));
      }
    }
    log4js("删除成功");
  }

  function waitForNextDungeonTime(interval = REQUEST_TIME_INTERVAL, timeout = 2*REQUEST_TIME_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector("#gadgetNextdungeonTime");
      if (!el) return reject("元素 #gadgetNextdungeonTime 未找到");

      const initialText = el.innerText;
      //console.log("当前文本为:", initialText);
      let finishTimestamp = parseTime(initialText);

      let elapsed = 0;

      const timer = setInterval(() => {
        elapsed += interval;
        if (elapsed >= timeout) {
          clearInterval(timer);
          return reject("超时：#gadgetNextdungeonTime 未发生有效变化");
        }
        if (finishTimestamp - Date.now() > REQUEST_TIME_TIMEOUT) {
          clearInterval(timer);
          return resolve("结算时间超过设定的超时时间2倍");
        }

        fetchPageAndExtract().then(currentText => {
          //console.log("新获取文本为:", currentText);
          if (
            currentText !== initialText &&
            currentText !== "现在" &&
            currentText !== "立刻"
          ) {
            //console.log("检测到地城时间变化，新的时间为:", currentText);
            clearInterval(timer);
            return resolve(currentText);
          }
        }).catch(err => {
          console.warn("fetchPageAndExtract 错误:", err);
        });
      }, interval);
    });
  }

  function fetchPageAndExtract() {
    const cleanUrl = location.href.split('?')[0];
    //console.log("尝试获取新页面", cleanUrl);
    return fetch(cleanUrl)
      .then(res => res.text())
      .then(html => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const newContent = doc.querySelector("#gadgetNextdungeonTime")?.innerText || '';
        //console.log("获取到的新内容：", newContent);
        return newContent;
      });
  }

  async function waitTillAwesomeTipsFinish(timeout = FETCHALL_TIMEOUT) {
    await new Promise(resolve => setTimeout(resolve, FETCHALL_INTERVAL));
    const start = Date.now();
    const exists = () => document.querySelector('#awesomeTips') !== null;

    if (!exists()) {
      //console.log("未检测到 #awesomeTips 出现");
      return false;
    }

    //console.log("#awesomeTips 出现，开始监控是否消失...");
    return new Promise(resolve => {
      const interval = setInterval(() => {
        if (!exists()) {
          clearInterval(interval);
          //console.log("#awesomeTips 已消失");
          resolve(true);
        } else if (Date.now() - start > timeout) {
          clearInterval(interval);
          //console.log("超时，#awesomeTips 仍未消失");
          resolve(false);
        }
      }, FETCHALL_INTERVAL);
    });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  readHeroTable();
  async function start() {
    await main();
  }
  start();

})();




