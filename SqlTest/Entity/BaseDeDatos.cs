using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace SqlTest.Entity
{
    public class BaseDeDatos
    {
        
        public BaseDeDatos(IJSRuntime js)
        {
            JS = js;
        }
        IJSRuntime JS { get; set; }

        public string Name { get; set; }
        public async Task<string> RunAsync(string sqlCommand)
        {
            string message;
            try
            {
                message = await JS.InvokeAsync<string>("RunSQL", Name, sqlCommand);
            }
            catch(Exception ex)
            {
                message = String.Join(Environment.NewLine,ex.GetInnerExceptions().Select((m)=>m.Message));
            }
            return message;
        }
        public override string ToString()
        {
            return Name;
        }

        public static async Task<string[]> GetNames(IJSRuntime js)
        {
            return (await js.InvokeAsync<IEnumerable<string>>("GetNamesDB")).ToArray();
        }
        public static async Task<BaseDeDatos> Create(IJSRuntime js,string name)
        {
            await js.InvokeVoidAsync("CreateDBSQL", name);
            return new BaseDeDatos(js) { Name = name };
        }
        public static async Task<string> Clone(IJSRuntime js, string name)
        {
           return await js.InvokeAsync<string>("CloneDBSQL", name);
        }
        public static async Task Remove(IJSRuntime js,string name)
        {
            await js.InvokeVoidAsync("RemoveDBSQL", name);
        }
        public static async Task RemoveAll(IJSRuntime js)
        {
            foreach (string name in await GetNames(js))
                await Remove(js, name);
        }
        public static async Task SaveAll(IJSRuntime js)
        {
            await js.InvokeVoidAsync("SaveAll");
        }

        public static async Task<SortedList<string,BaseDeDatos>> LoadAll(IJSRuntime js)
        {
            SortedList<string, BaseDeDatos> dic = new SortedList<string, BaseDeDatos>();
            foreach(string name in await GetNames(js))
            {
                dic.Add(name, new BaseDeDatos(js) { Name = name });
            }


            return dic;
        }
    }

   
    public static class Extensions
    { //source:https://stackoverflow.com/questions/9314172/getting-all-messages-from-innerexceptions
        public static IEnumerable<Exception> GetInnerExceptions(this Exception ex)
        {
            if (ex == null)
            {
                throw new ArgumentNullException("ex");
            }

            var innerException = ex;
            do
            {
                yield return innerException;
                innerException = innerException.InnerException;
            }
            while (innerException != null);
        }
    }
}
